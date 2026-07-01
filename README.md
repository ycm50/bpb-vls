# BPB Panel — Vless 版

> Cloudflare Workers 上的 VLESS 代理面板 — 只保留 VLESS 协议，剔除 Trojan/Warp/DoH/ProxyIP

共有两个版本：

- **vless-worker**（本仓库）- 精简版，仅 VLESS 协议，无需 `TR_PASS`
- **worker**（原版）- 全功能版，含 VLESS + Trojan + Warp + DoH + ProxyIP

---

## Vless 版代码结构

```
src/
├── vless-worker.ts          # 【入口】VLESS Worker 主文件
├── vless/                   # VLESS 专用逻辑
│   ├── init.ts              # 初始化全局配置（dict/settings/config）
│   ├── handler.ts           # VLESS over WebSocket 协议处理器（298 行）
│   ├── handlers.ts          # 面板 / 订阅 / 登录路由（296 行）
│   ├── config.ts            # VLESS 订阅链接生成
│   ├── kv.ts                # KV 数据读写（仅 settings，无 warpAccounts）
│   └── outbounds/
│       ├── xray.ts           # VLESS 出站 → Xray 配置
│       ├── sing-box.ts       # VLESS 出站 → Sing-box 配置
│       └── clash.ts          # VLESS 出站 → Clash-Mihomo 配置
├── auth.ts                  # JWT 认证（与完整版共用）
├── common/
│   ├── common.ts            # 公共工具函数
│   └── ...                  # 仅被 vless/import 的部分
├── cores/
│   ├── xray/                # Xray 完整配置生成（DNS/路由/入站/出站）
│   ├── sing-box/            # Sing-box 配置生成
│   ├── clash/               # Clash-Mihomo 配置生成
│   └── utils.ts             # 跨核心工具
├── protocols/
│   └── websocket/
│       └── common.ts        # WebSocket TCP/UDP 流处理（与完整版共用）
├── assets/
│   ├── panel/               # 管理面板 UI（JS 1278 行）
│   ├── login/               # 登录页
│   ├── secrets/             # UUID / 密码生成器
│   └── error/               # 错误页
└── types/
    ├── global.d.ts           # Settings / Env / Config 等全局类型
    ├── xray.d.ts
    ├── sing-box.d.ts
    └── clash.d.ts
```

### 与完整版对比

| 特性 | vless-worker（本仓库） | worker（原版） |
|------|:--------------------:|:-------------:|
| VLESS 协议 | ✅ | ✅ |
| Trojan 协议 | ❌（入口禁用） | ✅ |
| WireGuard Warp | ❌ | ✅ |
| DoH 服务器 | ❌ | ✅ |
| ProxyIP 页面 | ❌ | ✅ |
| TR_PASS 环境变量 | ❌ 无需设置 | ✅ 必填 |
| 链接/Warp刷新 | ❌ | ✅ |
| 打包大小 | 更小 | 较大 |

### Vless 入口路由

```
请求
 ├─ Upgrade: websocket ──→ WebSocket handler
 │    └─ 解析 base64 路径配置 → 仅接受 "vl" 协议 → VlOverWSHandler
 │
 └─ HTTP 请求 ──→ 按路径分发
      ├─ /panel          → 管理面板（设置/我的IP/改密）
      ├─ /panel/settings → 读取当前设置（JSON）
      ├─ /panel/update-settings → 更新设置（PUT JSON）
      ├─ /panel/reset-settings  → 恢复出厂设置
      ├─ /panel/reset-password  → 修改面板密码
      ├─ /panel/my-ip    → 查看出口 IP
      ├─ /sub/vless/<path>      → Xray 订阅（普通）
      ├─ /sub/vless-fragment/<path> → Xray 订阅（分片）
      ├─ /sub/vless/<path>?app=clash   → Clash 订阅
      ├─ /sub/vless/<path>?app=sing-box → Sing-box 订阅
      ├─ /login          → JWT 登录
      ├─ /logout         → 登出
      ├─ /secrets        → UUID 生成页面
      └─ 其他            → fallback（返回图标或 hCaptcha 回退）
```

### VLESS 协议数据流

```
客户端 ↗ WebSocket ↖  CF Workers          TCP ↗ 目标服务器
        │            │                     │
        │  vl://...   │   VlOverWSHandler   │
        │  Base64编码  │   decode (VLess)    │
        │  路径配置    │   parse address:port│
        └─────────────┘   ProxyIP/前缀重试  ┘
                           UDP/DNS 分流
```

核心处理逻辑 `VlOverWSHandler`：
1. 接收 WebSocket 连接
2. 解析 VLESS 协议头（UUID 验证、目标地址提取）
3. 建立 TCP 出站连接（直连或通过 ProxyIP/前缀）
4. 双向数据流中继（WebSocket ↔ TCP Socket）
5. 失败自动从地址列表中重试

---

## 部署

### 方式一：Workers 部署（推荐）

```bash
# 1. 安装依赖
npm install

# 2. 构建
npm run build:vless
# 输出：dist/vless-worker.js（可直接粘贴到 Cloudflare Workers 编辑器中）
# 或 dist/vless-worker.zip（含 obfuscator 混淆版）
```

**Cloudflare 控制台步骤：**

1. 进入 [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages
2. 创建 Worker → 命名（如 `bpb-vless`）
3. 将构建产物 `dist/vless-worker.js` 全文粘贴到编辑器
4. **设置环境变量**：

| 变量 | 示例值 | 说明 |
|------|--------|------|
| `UUID` | `550e8400-e29b-41d4-a716-446655440000` | VLESS 用户 ID，必填 |
| `PROXY_IP` | `1.2.3.4` 或 `proxy.example.com` | 代理 IP（可选） |
| `PREFIX` | `[2a02:898:146:64::]` | NAT64 前缀（可选） |
| `FALLBACK` | `www.example.com` | 回退域名（可选，默认 `www.hcaptcha.com`） |
| `DOH_URL` | `https://dns.quad9.net/dns-query` | 自定义 DoH（可选） |
| `SUB_PATH` | `mysecretpath` | 订阅路径后缀（可选，默认=UUID） |

5. **绑定 KV 命名空间**：
   - 设置 → 变量 → KV 命名空间绑定
   - 变量名：`kv`
   - 选择或新建一个 KV namespace

6. **部署** → 访问你的 Worker 域名

### 方式二：Pages 部署（通过 GitHub）

1. 在仓库根目录创建 `dist/` 并放入 `_worker.js`
2. Pages 配置：
   - 构建命令：`npm install && npm run build:vless`
   - 构建输出目录：`dist`
   - 输出文件：`dist/_worker.js`
3. 环境变量和 KV 绑定在 Pages 项目设置中配置

### 方式三：直接粘贴（无需构建）

如果你不想安装 Node.js，可以直接用构建好的内容：

1. 从 Releases 下载 `vless-worker.js`
2. 粘贴到 Cloudflare Worker 编辑器
3. 同样设置环境变量 + KV 绑定

### 首次使用

1. 访问 `https://你的域名/secrets` 生成 UUID
2. 将 UUID 填入环境变量 `UUID`
3. 访问 `https://你的域名/panel` 进入管理面板
4. 设置面板密码 → 登录 → 配置 DNS/IP/路由
5. 在面板中复制 VLESS 订阅链接 → 导入客户端

---

## 环境变量对照

| 变量 | vless-worker | worker 原版 |
|------|:-----------:|:----------:|
| `UUID` | ✅ 必填 | ✅ 必填 |
| `TR_PASS` | ❌ 无需 | ✅ 必填 |
| `PROXY_IP` | ✅ 可选 | ✅ 可选 |
| `PREFIX` | ✅ 可选 | ✅ 可选 |
| `FALLBACK` | ✅ 可选 | ✅ 可选 |
| `DOH_URL` | ✅ 可选 | ✅ 可选 |
| `SUB_PATH` | ✅ 可选 | ✅ 可选 |

## 客户端与订阅

| 客户端 | `?app=` 参数 | 核心 |
|--------|:----------:|:----:|
| v2rayNG / MahsaNG | `xray`（默认） | Xray |
| v2rayN / v2rayN-PRO | `xray`（默认） | Xray |
| Sing-box / Streisand | `sing-box` | Sing-box |
| Clash Meta / Verge Rev / FLClash | `clash` | Clash-Mihomo |

订阅路径格式：
```
/sub/vless/<SUB_PATH>?app=xray           # 普通配置
/sub/vless-fragment/<SUB_PATH>?app=xray  # 分片配置
```

## 构建命令

```bash
npm install
npm run check            # tsc --noEmit 类型检查
npm run build:vless      # 构建 vless-worker.js
npm run build            # 构建完整版 worker.js（可选）
```

## License

GNU General Public License v3.0
