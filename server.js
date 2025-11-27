require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = 'https://mestresdealuguelrpg.vercel.app';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));


// ---------- 1) Página inicial ----------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// ---------- 2) Login com Discord ----------
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


// ---------- 3) Callback do Discord ----------
app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;

    if (!code) {
        return res.status(400).send("Código de autorização não recebido.");
    }

    try {
        const tokenResponse = await axios.post(
            'https://discord.com/api/oauth2/token',
            new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: PUBLIC_BASE_URL + '/auth/discord/callback'
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const accessToken = tokenResponse.data.access_token;

        const userResponse = await axios.get(
            'https://discord.com/api/users/@me',
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );

        const username = userResponse.data.username;
        const discordId = userResponse.data.id;

        // ✅ Retorna pro site com os dados
        res.redirect(`/?username=${username}&discord_id=${discordId}`);

    } catch (error) {
        console.error("Erro Discord:", error.response?.data || error.message);
        res.status(500).send("Falha ao autenticar com o Discord.");
    }
});


// ---------- 4) Criar sessão de pagamento ----------
app.post('/create-checkout-session', async (req, res) => {
    const discordId = req.body.discordId;

    if (!discordId) {
        return res.status(400).json({
            error: {
                message: "Você precisa autenticar com o Discord antes de assinar."
            }
        });
    }

    try {
        const sessionStripe = await stripe.checkout.sessions.create({
            mode: 'subscription',

            line_items: [{
                price: 'price_1S0sEOI3XjYyzTqFx516rYmp',
                quantity: 1
            }],

            subscription_data: {
                metadata: {
                    discord_id: discordId
                }
            },

            success_url: `${PUBLIC_BASE_URL}?status=success`,
            cancel_url: `${PUBLIC_BASE_URL}?status=cancel`
        });

        res.json({ url: sessionStripe.url });

    } catch (error) {
        console.error("Erro Stripe:", error);
        res.status(500).json({
            error: { message: error.message }
        });
    }
});


// ---------- 5) Inicialização ----------
app.listen(PORT, () => {
    console.log("✅ Servidor rodando na porta " + PORT);
});
