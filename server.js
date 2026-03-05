const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// --- 邮件服务配置 ---
const transporter = nodemailer.createTransport({
    service: '163',
    auth: {
        user: 'chuan_website@163.com',
        pass: 'JWmqGtusrK5qfCjk'
    }
});

const DB_DIR = path.join(__dirname, 'User_Database');
const DB_FILE = path.join(DB_DIR, 'users.json');
const VIEW_FILE = path.join(DB_DIR, 'view_cache.json');

// 内存存储验证码，包含时间戳
let emailCodes = {}; 

const toHash = (text) => text ? crypto.createHash('sha256').update(String(text).trim()).digest('hex') : "";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 初始化数据库
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');
if (!fs.existsSync(VIEW_FILE)) fs.writeFileSync(VIEW_FILE, '{}', 'utf8');

const getData = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const saveData = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

// --- 接口：发送验证码 ---
app.post('/api/send-code', async (req, res) => {
    const { email, username } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "邮箱不能为空" });
    
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    emailCodes[email] = { code, timestamp: Date.now() };

    const mailOptions = {
        from: '"SECURITY SYSTEM" <chuan_website@163.com>',
        to: email,
        subject: '您的安全验证码',
        text: `尊敬的${username || '用户'}，您的验证码是${code}，有效期五分钟！！！`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "验证码已发送" });
    } catch (error) {
        res.status(500).json({ success: false, message: "邮件服务异常" });
    }
});

// --- 接口：注册 ---
app.post('/api/register', (req, res) => {
    const { username, password, email, code } = req.body;
    const users = getData(DB_FILE);
    const record = emailCodes[email];

    if (!record || record.code !== code) return res.status(400).json({ success: false, message: "验证码不正确" });
    if (Date.now() - record.timestamp > 300000) return res.status(400).json({ success: false, message: "验证码已过期（5分钟限时）" });
    if (users.find(u => u.username === username)) return res.status(400).json({ success: false, message: "用户名已被占用" });

    users.push({
        username,
        password_hash: toHash(password),
        email,
        role: 'user',
        created_at: new Date().toLocaleString()
    });
    
    saveData(DB_FILE, users);
    delete emailCodes[email];
    res.json({ success: true });
});

// --- 接口：登录 (安全延迟 3 秒) ---
app.post('/api/login', async (req, res) => {
    const { username, password, secret } = req.body;
    
    // 安全间隔：延迟 3 秒处理
    await sleep(3000);

    const users = getData(DB_FILE);
    const hP = toHash(password);
    const hS = toHash(secret);
    
    const user = users.find(u => u.username === username && u.password_hash === hP);
    
    if (!user) return res.status(401).json({ success: false, message: "凭据验证失败" });
    if (user.is_used) return res.status(403).json({ success: false, message: "此临时凭据已失效" });
    
    if (user.role === 'temp_admin') {
        if (user.secret_hash !== hS) return res.status(401).json({ success: false, message: "安全密钥错误" });
        user.is_used = true;
        saveData(DB_FILE, users);
    }

    res.json({ success: true, user: { username: user.username, role: user.role } });
});

// --- 接口：找回密码 ---
app.post('/api/reset-password', (req, res) => {
    const { email, code, new_password } = req.body;
    const record = emailCodes[email];
    if (!record || record.code !== code) return res.status(400).json({ success: false, message: "验证码错误" });
    if (Date.now() - record.timestamp > 300000) return res.status(400).json({ success: false, message: "验证码已过期" });

    const users = getData(DB_FILE);
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, message: "该邮箱未关联账号" });

    user.password_hash = toHash(new_password);
    saveData(DB_FILE, users);
    delete emailCodes[email];
    res.json({ success: true });
});

// --- 管理员生成接口 ---
app.post('/api/generate-temp-admin', (req, res) => {
    const { dev_pass, note } = req.body;
    if (dev_pass !== 'Cmj123456') return res.status(403).json({ success: false, message: "禁止访问" });
    const id = "ADMIN_" + Math.random().toString(36).substring(2, 7).toUpperCase();
    const rawP = "P" + Math.floor(1000 + Math.random() * 9000);
    const rawS = "S" + Math.floor(1000 + Math.random() * 9000);
    const users = getData(DB_FILE);
    users.push({
        username: id, password_hash: toHash(rawP), secret_hash: toHash(rawS),
        role: 'temp_admin', created_at: new Date().toLocaleString(), is_used: false, note: note || 'N/A'
    });
    saveData(DB_FILE, users);
    const viewCache = getData(VIEW_FILE);
    viewCache[id] = { p: rawP, s: rawS };
    saveData(VIEW_FILE, viewCache);
    res.json({ success: true, credentials: { id, pwd: rawP, sec: rawS } });
});

app.get('/api/temp-admins', (req, res) => {
    const users = getData(DB_FILE).filter(u => u.role === 'temp_admin');
    const viewCache = getData(VIEW_FILE);
    res.json(users.map(u => ({
        id: u.username, note: u.note, time: u.created_at, status: u.is_used,
        realP: viewCache[u.username] ? viewCache[u.username].p : "---",
        realS: viewCache[u.username] ? viewCache[u.username].s : "---"
    })));
});

app.listen(3000, () => console.log('>>> SECURE CORE SERVER READY ON PORT 3000 <<<'));