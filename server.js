// 1. Importações e Configuração Inicial
require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANTE: aqui deve ser seu domínio correto no Vercel
const PUBLIC_BASE_URL = 'https://rpg-teste.vercel.app';

// 2. Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); 

app.use(session({
    secret: process.env.SESSION_SECRET || "super-secret-key",
    resave: false,
    saveUninitialized: true,
}));


// 3. Página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// 4. Checar status de login (se você quiser usar no futuro)
app.get('/get-user-status', (req, res) => {
    if (req.session.discordUser) {
        res.json({ loggedIn: true, user: req.session.discordUser });
    } else {
        res.json({ loggedIn: false });
    }
});


// 5. Iniciar autenticação com o Discord
app.get('/auth/discord', (req, res) => {

    const redirectUri = encodeURIComponent(
        PUBLIC_BASE_URL + '/auth/discord/callback'
    );

    const discordAuthUrl =
        `https://discord.com/api/oauth2/authorize` +
        `?client_id=${process.env.DISCORD_CLIENT_ID}` +
        `&redirect_uri=${redirectUri}` +
        `&response_type=code` +
        `&scope=identify`;

    res.redirect(discordAuthUrl);
});


// 6. Callback do Discord (onde o MILAGRE acontece)
app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;

    if (!code) {
        return res.status(400).send("Erro: código de autorização não encontrado.");
    }

    try {
        // Trocar o code pelo token
        const tokenResponse = await axios.post(
            'https://discord.com/api/oauth2/token',
            new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: PUBLIC_BASE_URL + '/auth/discord/callback',
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const accessToken = tokenResponse.data.access_token;

        // Buscar dados do usuário
        const userResponse = await axios.get(
            'https://discord.com/api/users/@me',
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const username = userResponse.data.username;
        const discordId = userResponse.data.id;

        // Guardar na sessão
        req.session.discordUser = { 
            id: discordId, 
            username: username 
        };

        // Redirecionar para o front com os parâmetros necessários
        res.redirect(
            `/?username=${encodeURIComponent(username)}&discord_id=${encodeURIComponent(discordId)}`
        );

    } catch (error) {
        console.error("Erro na autenticação com o Discord:", 
            error.response ? error.response.data : error.message
        );
        res.status(500).send("Erro ao autenticar com o Discord.");
    }
});


// 7. Criar sessão de pagamento do Stripe
app.post('/create-checkout-session', async (req, res) => {

    // Impede compra sem login
    if (!req.session.discordUser || !req.session.discordUser.id) {
        return res.status(400).json({
            error: { message: "Você precisa autenticar com o Discord antes de assinar." }
        });
    }

    const priceId = 'price_1S0sEOI3XjYyzTqFx516rYmp';
    const discordId = req.session.discordUser.id;

    try {
        const sessionStripe = await stripe.checkout.sessions.create({
            mode: 'subscription',

            line_items: [
                { price: priceId, quantity: 1 }
            ],

            subscription_data: {
                metadata: { discord_id: discordId }
            },

            success_url: `${PUBLIC_BASE_URL}/?status=success`,
            cancel_url: `${PUBLIC_BASE_URL}/?status=cancel`
        });

        res.json({ url: sessionStripe.url });

    } catch (error) {
        console.error("Erro ao criar sessão do Stripe:", error);
        res.status(500).json({ error: { message: error.message } });
    }
});


// 8. Inicializar servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log(`Acesse no Vercel: ${PUBLIC_BASE_URL}`);
});
