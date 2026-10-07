const { OAuth2Client } = require('google-auth-library');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '96137544394-n9o475hrb1egqr67p0ussrdg0cbl391l.apps.googleusercontent.com';
const googleClient = new OAuth2Client(CLIENT_ID);

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const credential = request.body?.credential;
  if (!credential || typeof credential !== 'string') {
    return response.status(400).json({ error: 'Google credential is required' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: CLIENT_ID });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      return response.status(401).json({ error: 'Google could not verify this email address' });
    }

    return response.status(200).json({
      account: {
        id: payload.sub,
        email: payload.email,
        name: payload.name || payload.email.split('@')[0],
        picture: payload.picture || ''
      }
    });
  } catch (error) {
    console.error('Google token verification failed:', error.message);
    return response.status(401).json({ error: 'Google sign-in could not be verified' });
  }
};
