const http = require('http');

const data = JSON.stringify({
  username: 'testuser',
  email: 'test@example.com',
  password: 'secret123',
  role: 'owner',
});

const options = {
  hostname: 'localhost',
  port: 5001,
  path: '/api/auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
};

const req = http.request(options, (res) => {
  console.log('status', res.statusCode);
  let body = '';
  res.on('data', (c) => (body += c));
  res.on('end', () => {
    console.log(body);
  });
});

req.on('error', (e) => console.error(e));
req.write(data);
req.end();
