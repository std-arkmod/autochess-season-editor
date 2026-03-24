# AutoChess 赛季数据编辑器

支持多人在线协作的 AutoChess 游戏赛季配置数据编辑器。

## 部署

### 1. 前置条件

- **Node.js** >= 20
- **pnpm** >= 9（`npm install -g pnpm`）
- **PostgreSQL** >= 14

### 2. 克隆项目 & 安装依赖

```bash
git clone <repo-url> autochess-season-editor
cd autochess-season-editor
pnpm install
```

### 3. 配置环境变量

```bash
cp packages/server/.env.example packages/server/.env
```

编辑 `packages/server/.env`：

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/autochess_editor
JWT_SECRET=<改成随机字符串>
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

> **生产环境**：`CORS_ORIGIN` 设为前端实际域名，`JWT_SECRET` 务必使用强随机值。

### 4. 初始化数据库

```bash
# 创建数据库（以 PostgreSQL 超级用户执行）
sudo -u postgres psql -c "CREATE DATABASE autochess_editor;"

# 运行迁移（建表）
pnpm --filter @autochess-editor/server db:migrate

# 创建管理员账号（默认 admin / admin123）
pnpm --filter @autochess-editor/server db:seed

# 或自定义用户名密码：
pnpm --filter @autochess-editor/server db:seed myuser mypassword
```

### 5. 导入赛季数据（模板）

导入的数据默认作为**模板**（所有用户可见，需复制后才能编辑）。

项目自带赛季数据在 `packages/server/data/` 目录下，每个 `.json` 文件对应一个赛季（`AutoChessSeasonData` 格式）。更新游戏数据时直接替换对应文件即可。

```bash
# 导入 data/ 目录下所有赛季（推荐，文件名作为赛季名）
pnpm --filter @autochess-editor/server db:import

# 也可以指定单个文件导入
pnpm --filter @autochess-editor/server db:import /path/to/season.json "赛季名称"

# 如需导入为私有赛季（而非模板），加 --private 标志：
pnpm --filter @autochess-editor/server db:import /path/to/season.json --private
```

### 6. 启动

#### 开发模式

```bash
# 同时启动前后端（热重载）
pnpm dev:all

# 或分别启动：
pnpm dev:server   # 后端 http://localhost:3001
pnpm dev          # 前端 http://localhost:5173（自动代理 /api 和 /yjs）
```

#### 生产模式

```bash
# 构建前端
pnpm --filter @autochess-editor/editor build

# 启动后端（使用 tsx 运行 TypeScript）
cd packages/server
npx tsx src/index.ts
# 或使用 pm2 等进程管理器：
# pm2 start "npx tsx src/index.ts" --name autochess-server
```

前端构建产物在 `packages/editor/dist/`，用 Nginx/Caddy 托管静态文件，并将 `/api` 和 `/yjs` 反向代理到后端端口。

**Nginx 参考配置：**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    root /path/to/autochess-season-editor/packages/editor/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket 反向代理
    location /yjs/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### 7. 访问

打开浏览器访问前端地址，使用管理员账号登录。

---

## 重置数据库

```bash
# 保留用户，清除赛季等数据后重新导入
pnpm --filter @autochess-editor/server db:reset
pnpm --filter @autochess-editor/server db:import

# 或一键执行：
pnpm --filter @autochess-editor/server db:reset-import

# 完全重建（包括用户）：
sudo -u postgres psql -c "DROP DATABASE IF EXISTS autochess_editor;"
sudo -u postgres psql -c "CREATE DATABASE autochess_editor;"
pnpm --filter @autochess-editor/server db:migrate
pnpm --filter @autochess-editor/server db:seed
pnpm --filter @autochess-editor/server db:import
```

---

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/autochess_editor` | PostgreSQL 连接串 |
| `JWT_SECRET` | `autochess-editor-secret-change-me` | JWT 签名密钥（生产环境务必修改） |
| `PORT` | `3001` | 后端监听端口 |
| `CORS_ORIGIN` | `http://localhost:5173` | 允许的跨域来源 |
