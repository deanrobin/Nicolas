# 部署到云服务器

系统：**Ubuntu 22.04**，需要开放端口 **80**（前端）和 **8080**（后端 API，也可以只开 80 用 nginx 反代）

---

## 第一步：安装环境

```bash
sudo apt update && sudo apt upgrade -y

# Java 17
sudo apt install -y openjdk-17-jdk

# Maven
sudo apt install -y maven

# MySQL 8
sudo apt install -y mysql-server
sudo mysql_secure_installation   # 一路按提示设置 root 密码

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Nginx
sudo apt install -y nginx
```

验证：
```bash
java -version    # openjdk 17
mvn -version     # Apache Maven 3.x
node -version    # v20.x
mysql --version  # 8.0.x
nginx -version   # 1.x
```

---

## 第二步：创建数据库

```bash
sudo mysql -u root -p

# 在 MySQL 里执行：
CREATE DATABASE nicolas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'nicolas'@'localhost' IDENTIFIED BY '你的数据库密码';
GRANT ALL PRIVILEGES ON nicolas.* TO 'nicolas'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 第三步：上传代码

```bash
# 方式 A：git clone（推荐）
cd /home/ubuntu
git clone https://github.com/deanrobin/Nicolas.git
cd Nicolas

# 方式 B：scp 上传
# scp -r ./Nicolas ubuntu@你的服务器IP:/home/ubuntu/
```

---

## 第四步：部署 Java 后端

```bash
cd /home/ubuntu/Nicolas/backend/java

# 打包
mvn package -DskipTests

# 测试能不能跑起来（先确认）
DB_HOST=localhost \
DB_PORT=3306 \
DB_USER=nicolas \
DB_PASS=你的数据库密码 \
JWT_SECRET=换成一个随机32位字符串 \
MAIL_DEV_MODE=true \
java -jar target/nicolas-backend-0.1.0-SNAPSHOT.jar
```

看到 `Started NicolasApplication` 说明没问题，Ctrl+C 停掉，然后设置成后台服务：

```bash
sudo nano /etc/systemd/system/nicolas-api.service
```

粘贴以下内容（**替换 `你的数据库密码` 和 `你的JWT密钥`**）：

```ini
[Unit]
Description=Nicolas Java Backend
After=network.target mysql.service

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/Nicolas/backend/java
ExecStart=/usr/bin/java -jar /home/ubuntu/Nicolas/backend/java/target/nicolas-backend-0.1.0-SNAPSHOT.jar
Restart=always
RestartSec=5

Environment=DB_HOST=localhost
Environment=DB_PORT=3306
Environment=DB_USER=nicolas
Environment=DB_PASS=你的数据库密码
Environment=JWT_SECRET=换成一个随机32位字符串
Environment=JWT_EXPIRATION_DAYS=7
Environment=MAIL_DEV_MODE=true

[Install]
WantedBy=multi-user.target
```

```bash
# 启动并设置开机自启
sudo systemctl daemon-reload
sudo systemctl enable nicolas-api
sudo systemctl start nicolas-api

# 查看状态
sudo systemctl status nicolas-api
# 查看日志
sudo journalctl -u nicolas-api -f
```

---

## 第五步：构建前端

```bash
cd /home/ubuntu/Nicolas/frontend
npm install
npm run build
# 产物在 dist/ 目录
```

---

## 第六步：配置 Nginx

```bash
sudo nano /etc/nginx/sites-available/agents-bazaar
```

粘贴：

```nginx
server {
    listen 80;
    server_name 你的服务器IP或域名;

    # 前端静态文件
    root /home/ubuntu/Nicolas/frontend/dist;
    index index.html;

    # React 路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 反代 Java API（把 /api/xxx 转发到后端的 /xxx）
    location /api/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/agents-bazaar /etc/nginx/sites-enabled/
sudo nginx -t          # 检查语法
sudo systemctl reload nginx
```

---

## 完成！访问测试

浏览器打开 `http://你的服务器IP`，应该能看到登录页。

后端健康检查：
```bash
curl http://你的服务器IP/api/actuator/health
# 应返回 {"status":"UP",...}
```

---

## 日常运维

```bash
# 查看后端日志
sudo journalctl -u nicolas-api -f

# 重启后端（更新代码后）
cd /home/ubuntu/Nicolas/backend/java
git pull
mvn package -DskipTests
sudo systemctl restart nicolas-api

# 更新前端（更新代码后）
cd /home/ubuntu/Nicolas/frontend
git pull
npm run build
sudo systemctl reload nginx   # 不需要重启，nginx 直接读新文件
```

---

## 如果要配邮件发送（可选）

在 `/etc/systemd/system/nicolas-api.service` 里把 `MAIL_DEV_MODE=true` 改成：

```ini
Environment=MAIL_DEV_MODE=false
Environment=MAIL_HOST=smtp.gmail.com
Environment=MAIL_USER=你的Gmail地址
Environment=MAIL_PASS=你的Gmail应用专用密码
Environment=MAIL_FROM=noreply@你的域名
```

Gmail 需要开启「两步验证」然后生成「应用专用密码」，不能直接用登录密码。

```bash
sudo systemctl daemon-reload
sudo systemctl restart nicolas-api
```
