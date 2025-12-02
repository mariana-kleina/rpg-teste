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

// --- Rotas de Páginas ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/confirmacao', (req, res) => {
    res.sendFile(path.join(__dirname, 'confirmacao.html'));
});

// --- Autenticação Discord ---
app.get('/auth/discord', (req, res) => {
    const redirectUri = encodeURIComponent(PUBLIC_BASE_URL + '/auth/discord/callback');
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=identify`;
    res.redirect(discordAuthUrl);
});

app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send("Código rúnico não recebido.");

    try {
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: PUBLIC_BASE_URL + '/auth/discord/callback'
        }));

        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` }
        });

        const { username, id } = userResponse.data;
        res.redirect(`/?username=${username}&discord_id=${id}`);

    } catch (error) {
        console.error("Erro Discord:", error);
        res.status(500).send("Falha crítica na autenticação com a Guilda.");
    }
});

// --- Checkout Stripe ---
app.post('/create-checkout-session', async (req, res) => {
    const { discordId, idCargoDiscord, nomeAventura } = req.body;

    if (!discordId || !idCargoDiscord || !nomeAventura) {
        return res.status(400).json({ error: { message: "Dados insuficientes para o contrato." } });
    }

    try {
        // Redireciona para a nova página de confirmação 
        const successUrl = `${PUBLIC_BASE_URL}/confirmacao?mesa=${encodeURIComponent(nomeAventura)}`;

        const sessionStripe = await stripe.checkout.sessions.create({
            mode: 'subscription',
            allow_promotion_codes: true,
            client_reference_id: discordId, 
            line_items: [{
                price: 'price_1SXYtX2KwrC1lbXxtl7lCyNx', // ID Price LIVE
                quantity: 1
            }],
            subscription_data: {
                metadata: {
                    discord_id: discordId,
                    id_cargo_discord: idCargoDiscord,
                    nome_aventura: nomeAventura
                }
            },
            success_url: successUrl,
            cancel_url: `${PUBLIC_BASE_URL}?status=cancel`
        });

        res.json({ url: sessionStripe.url });

    } catch (error) {
        console.error("Erro Stripe:", error);
        res.status(500).json({ error: { message: error.message } });
    }
});

app.listen(PORT, () => console.log(`🔥 Portal da Guilda aberto na porta ${PORT}`));