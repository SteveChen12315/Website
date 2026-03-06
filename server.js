const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const multer = require('multer');

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
const SCHEDULE_FILE = path.join(DB_DIR, 'schedules.json'); 
const IDEAS_FILE = path.join(DB_DIR, 'ideas.json'); 

// --- 文件上传配置 (自动适配跨平台) ---
// 将存储位置设为项目目录下的 'Idea' 文件夹，不再硬编码 C盘绝对路径
const STORAGE_BASE = path.join(__dirname, 'Idea');

// 确保目录存在
if (!fs.existsSync(STORAGE_BASE)) fs.mkdirSync(STORAGE_BASE, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const now = new Date();
        const dir = path.join(STORAGE_BASE, `${now.getFullYear()}-${now.getMonth() + 1}`);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// 开启静态资源映射
app.use('/Idea', express.static(STORAGE_BASE));

// 内存存储验证码
let emailCodes = {}; 

const toHash = (text) => text ? crypto.createHash('sha256').update(String(text).trim()).digest('hex') : "";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 初始化数据库
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');
if (!fs.existsSync(VIEW_FILE)) fs.writeFileSync(VIEW_FILE, '{}', 'utf8');
if (!fs.existsSync(SCHEDULE_FILE)) fs.writeFileSync(SCHEDULE_FILE, '[]', 'utf8');
if (!fs.existsSync(IDEAS_FILE)) fs.writeFileSync(IDEAS_FILE, '[]', 'utf8');

const getData = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const saveData = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

// --- 接口：发送验证码 ---
app.post('/api/send-code', async (req, res) => {
    const { email, username } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "邮箱不能为空" });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    emailCodes[email] = { code, timestamp: Date.now() };
    try {
        await transporter.sendMail({
            from: '"SECURITY SYSTEM" <chuan_website@163.com>', to: email,
            subject: '您的安全验证码', text: `尊敬的${username || '用户'}，您的验证码是${code}，有效期五分钟！！！`
        });
        res.json({ success: true, message: "验证码已发送" });
    } catch (error) { res.status(500).json({ success: false, message: "邮件服务异常" }); }
});

// --- 接口：注册 ---
app.post('/api/register', (req, res) => {
    const { username, password, email, code } = req.body;
    const users = getData(DB_FILE);
    const record = emailCodes[email];
    if (!record || record.code !== code) return res.status(400).json({ success: false, message: "验证码不正确" });
    if (Date.now() - record.timestamp > 300000) return res.status(400).json({ success: false, message: "验证码已过期（5分钟限时）" });
    if (users.find(u => u.username === username)) return res.status(400).json({ success: false, message: "用户名已被占用" });
    users.push({ username, password_hash: toHash(password), email, role: 'user', created_at: new Date().toLocaleString() });
    saveData(DB_FILE, users); delete emailCodes[email];
    res.json({ success: true });
});

// --- 接口：登录 ---
app.post('/api/login', async (req, res) => {
    await sleep(3000);
    const { username, password, secret } = req.body;
    const users = getData(DB_FILE);
    const hP = toHash(password);
    const hS = toHash(secret);
    const user = users.find(u => u.username === username && u.password_hash === hP);
    if (!user) return res.status(401).json({ success: false, message: "凭据验证失败" });
    if (user.is_used) return res.status(403).json({ success: false, message: "此临时凭据已失效" });
    if (user.role === 'temp_admin') {
        if (user.secret_hash !== hS) return res.status(401).json({ success: false, message: "安全密钥错误" });
        user.is_used = true; saveData(DB_FILE, users);
    }
    res.json({ success: true, user: { username: user.username, role: user.role } });
});

// --- 接口：找回密码 ---
app.post('/api/reset-password', (req, res) => {
    const { email, code, new_password } = req.body;
    const record = emailCodes[email];
    if (!record || record.code !== code) return res.status(400).json({ success: false, message: "验证码错误" });
    const users = getData(DB_FILE);
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, message: "该邮箱未关联账号" });
    user.password_hash = toHash(new_password);
    saveData(DB_FILE, users); delete emailCodes[email];
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
    users.push({ username: id, password_hash: toHash(rawP), secret_hash: toHash(rawS), role: 'temp_admin', created_at: new Date().toLocaleString(), is_used: false, note: note || 'N/A' });
    saveData(DB_FILE, users);
    const viewCache = getData(VIEW_FILE);
    viewCache[id] = { p: rawP, s: rawS };
    saveData(VIEW_FILE, viewCache);
    res.json({ success: true, credentials: { id, pwd: rawP, sec: rawS } });
});

app.get('/api/temp-admins', (req, res) => {
    const users = getData(DB_FILE).filter(u => u.role === 'temp_admin');
    const viewCache = getData(VIEW_FILE);
    res.json(users.map(u => ({ id: u.username, note: u.note, time: u.created_at, status: u.is_used, realP: viewCache[u.username]?.p || "---", realS: viewCache[u.username]?.s || "---" })));
});

// --- 日程管理接口 ---
app.get('/api/schedules', (req, res) => {
    res.json(getData(SCHEDULE_FILE));
});

app.post('/api/schedules', (req, res) => {
    const { id, user_name, content, start_time, end_time } = req.body;
    if (!user_name || !content) return res.status(400).json({ success: false });
    let data = getData(SCHEDULE_FILE);
    if (id) {
        const index = data.findIndex(item => item.id == id);
        if (index !== -1 && data[index].user_name === user_name) {
            data[index] = { ...data[index], content, start_time, end_time };
        }
    } else {
        data.push({ id: Date.now(), user_name, content, start_time, end_time, created_at: new Date().toLocaleString() });
    }
    saveData(SCHEDULE_FILE, data);
    res.json({ success: true });
});

app.delete('/api/schedules/:id', (req, res) => {
    const { id } = req.params;
    const { user_name } = req.query;
    let data = getData(SCHEDULE_FILE);
    const filtered = data.filter(item => !(item.id == id && item.user_name === user_name));
    saveData(SCHEDULE_FILE, filtered);
    res.json({ success: true });
});

// --- Idea 管理接口 ---
app.get('/api/ideas', (req, res) => {
    res.json(getData(IDEAS_FILE));
});

app.post('/api/ideas', upload.single('file'), (req, res) => {
    const { title, content, user_name } = req.body;
    const data = getData(IDEAS_FILE);
    
    // 强制转换为正斜杠，确保网页能识别路径，并获取相对于存储基准的路径
    const media_url = req.file ? path.relative(STORAGE_BASE, req.file.path).split(path.sep).join('/') : null;
    
    data.unshift({
        id: Date.now(),
        title,
        content,
        user_name,
        media_url,
        created_at: new Date().toLocaleString()
    });
    saveData(IDEAS_FILE, data);
    res.json({ success: true });
});

app.delete('/api/ideas/:id', (req, res) => {
    const { id } = req.params;
    let data = getData(IDEAS_FILE);
    const item = data.find(i => i.id == id);
    if (item && item.media_url) {
        // 使用 path.join 确保在任何系统下都能找到文件
        const filePath = path.join(STORAGE_BASE, item.media_url);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    data = data.filter(i => i.id != id);
    saveData(IDEAS_FILE, data);
    res.json({ success: true });
});

app.listen(3000, () => console.log('>>> ALL-IN-ONE SECURE SERVER READY ON PORT 3000 <<<'));