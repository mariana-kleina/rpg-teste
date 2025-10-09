
// 1. Importações e Configuração Inicial
require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const session = require('express-session');

const app = express();
const PORT = 3000;

// 2. Configuração dos Middlewares
app.use(cors());
app.use(express.static(path.join(__dirname)));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
}));

// 3. Rota Principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 4. Rota para a página verificar o status de login do usuário
app.get('/get-user-status', (req, res) => {
    if (req.session.discordUser) {
        res.json({ loggedIn: true, user: req.session.discordUser });
    } else {
        res.json({ loggedIn: false });
    }
});

// 5. Rota para iniciar a autenticação com o Discord
app.get('/auth/discord', (req, res) => {
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent('http://localhost:3000/auth/discord/callback')}&response_type=code&scope=identify`;
    res.redirect(discordAuthUrl);
});

// 6. Rota de Callback (Onde o Discord nos envia o usuário de volta)
app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send("Erro: código de autorização não encontrado.");

    try {
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token',
            new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: 'http://localhost:3000/auth/discord/callback',
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            }
        );
        const accessToken = tokenResponse.data.access_token;

        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        req.session.discordUser = { id: userResponse.data.id, username: userResponse.data.username };
        res.redirect('/');
    } catch (error) {
        console.error("Erro na autenticação com o Discord:", error.response ? error.response.data : error.message);
        res.status(500).send("Ocorreu um erro ao conectar com o Discord.");
    }
});

// 7. Rota para Criar a Sessão de Checkout do Stripe
app.post('/create-checkout-session', async (req, res) => {
    if (!req.session.discordUser || !req.session.discordUser.id) {
        return res.status(400).json({ error: { message: "Por favor, conecte com o Discord antes de assinar." } });
    }

    const priceId = 'price_1S0sEOI3XjYyzTqFx516rYmp'; 
    const discordId = req.session.discordUser.id;

    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ 
                price: priceId, 
                quantity: 1,
                description: 'Assinatura RPG Next Teste - Acesso ao Jogo' 
            }],
            subscription_data: {
                metadata: { discord_id: discordId }
            },
        
            success_url: 'http://localhost:3000/?status=success',
            cancel_url: 'http://localhost:3000/?status=cancel',
        });
        res.json({ url: session.url });
    } catch (error) {
        console.error("Erro ao criar a sessão do Stripe:", error);
        res.status(500).json({ error: { message: error.message } });
    }
});


// 8. Inicia o servidor
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));