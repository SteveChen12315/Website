const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 相对路径配置：指向父级目录的数据库
const DB_DIR = path.join(__dirname, '..', 'User_Database');
const SCHEDULE_FILE = path.join(DB_DIR, 'schedules.json');

// 初始化日程数据库文件
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(SCHEDULE_FILE)) fs.writeFileSync(SCHEDULE_FILE, '[]', 'utf8');

const getSchedules = () => JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
const saveSchedules = (data) => fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2), 'utf8');

// --- 接口：获取所有日程 ---
app.get('/api/schedules', (req, res) => {
    try {
        const data = getSchedules();
        res.json(data);
    } catch (e) {
        res.status(500).json({ success: false, message: "Read Error" });
    }
});

// --- 接口：保存/新增日程 ---
app.post('/api/schedules', (req, res) => {
    const { id, user_name, content, start_time, end_time } = req.body;
    if (!user_name || !content) return res.status(400).json({ success: false });

    let data = getSchedules();
    
    if (id) {
        // 更新逻辑
        const index = data.findIndex(item => item.id === id);
        if (index !== -1 && data[index].user_name === user_name) {
            data[index] = { ...data[index], content, start_time, end_time };
        }
    } else {
        // 新增逻辑
        const newEvent = {
            id: Date.now(), // 使用时间戳作为唯一ID
            user_name,
            content,
            start_time,
            end_time,
            created_at: new Date().toLocaleString()
        };
        data.push(newEvent);
    }

    saveSchedules(data);
    res.json({ success: true });
});

// --- 接口：删除日程 ---
app.delete('/api/schedules/:id', (req, res) => {
    const { id } = req.params;
    const { user_name } = req.query; // 安全起见，校验用户名
    
    let data = getSchedules();
    const filtered = data.filter(item => !(item.id == id && item.user_name === user_name));
    
    if (data.length !== filtered.length) {
        saveSchedules(filtered);
        res.json({ success: true });
    } else {
        res.status(403).json({ success: false, message: "Unauthorized or not found" });
    }
});

app.listen(3000, () => console.log('>>> SCHEDULE SERVICE RUNNING ON PORT 3000 <<<'));