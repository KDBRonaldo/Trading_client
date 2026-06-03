# 项目文件结构说明

本文档用于说明交易客户端项目中各文件和目录的主要职责，方便小组成员按分工查找和修改代码。

## 顶层文件

```text
index.html
styles.css
app.js
package.json
.env.example
.gitignore
README.md
INTERFACES.md
DATABASE.md
TEAM_WORK.md
FILE_STRUCTURE.md
```

- `index.html`：前端页面结构，包含登录页、交易主界面、资金信息、持仓、行情、买卖委托、成交记录、价格提醒、密码修改等页面区域。
- `styles.css`：前端样式文件，控制整体红白配色、布局、表格、按钮、表单和响应式显示。
- `app.js`：前端启动入口，负责绑定页面事件，例如登录、退出、刷新行情、提交买卖委托、撤单、设置提醒、修改密码。
- `package.json`：Node 后端依赖和启动命令配置。后端需要 `express`、`mysql2`、`cors`、`dotenv`。
- `.env.example`：后端环境变量示例，用于配置端口、MySQL 地址、数据库账号和密码。正式运行时复制为 `.env`。
- `.gitignore`：Git 忽略配置，避免提交 `node_modules/`、`.env` 等本地文件。
- `README.md`：项目总体说明，包括运行方式、接口配置方式和后端启动方式。
- `INTERFACES.md`：和其他模块交互的接口说明，包括资金账户系统、证券账户系统、交易管理系统、中央交易系统等。
- `DATABASE.md`：数据库设计说明，说明交易客户端本地数据库维护哪些表、写入时机和边界。
- `TEAM_WORK.md`：小组分工说明，说明不同成员负责的模块和主要修改文件。
- `FILE_STRUCTURE.md`：当前文件结构说明，也就是本文档。

## 前端代码目录 `js/`

```text
js/
├── config.js
├── mock-data.js
├── state.js
├── dom.js
├── api.js
├── client-api.js
├── account-api.js
├── management-api.js
├── central-api.js
├── business.js
└── render.js
```

- `js/config.js`：前端配置文件，保存各外部系统接口地址和接口路径。配置项来自浏览器 `localStorage`，例如 `clientApiBase`、`accountApiBase`、`centralTradingApiBase`。
- `js/mock-data.js`：本地演示数据。没有连接外部系统和数据库时，页面使用这里的数据进行模拟演示。
- `js/state.js`：前端状态管理，负责读取和保存本地状态，目前演示模式下通过 `localStorage` 持久化。
- `js/dom.js`：统一保存页面 DOM 节点引用，避免业务代码里反复写 `document.querySelector()`。
- `js/api.js`：通用 HTTP 请求工具，封装接口 URL 拼接、`fetch` 请求、超时和错误处理。
- `js/client-api.js`：交易客户端自身后端接口封装，负责调用本地数据库相关接口，例如会话、委托、成交、价格提醒、提醒通知。
- `js/account-api.js`：资金账户系统和证券账户系统接口封装，负责登录校验、资金查询、持仓查询、冻结资金、释放资金、冻结持仓、释放持仓、修改密码。
- `js/management-api.js`：交易管理系统接口封装，负责委托提交前的交易审查。
- `js/central-api.js`：中央交易系统接口封装，负责行情查询、提交委托、撤单、获取成交回报。
- `js/business.js`：前端核心业务流程，包含登录、会话校验、账户刷新、买入、卖出、撤单、成交处理、价格提醒、密码修改等逻辑。
- `js/render.js`：页面渲染逻辑，负责把账户、持仓、行情、委托、成交、提醒等数据显示到页面上。

## 后端代码目录 `server/`

```text
server/
├── app.js
├── db.js
└── routes/
    ├── sessions.js
    ├── orders.js
    ├── trades.js
    ├── alerts.js
    └── notifications.js
```

- `server/app.js`：交易客户端后端入口，创建 Express 服务，挂载各类数据库接口路由。
- `server/db.js`：MySQL 连接池配置，只负责连接数据库，不直接写具体业务 SQL。
- `server/routes/sessions.js`：登录会话接口，对应 `login_session` 表，负责登录成功写入会话、退出或过期时更新会话状态。
- `server/routes/orders.js`：委托记录接口，对应 `order_record` 表，负责新增委托、查询委托、更新委托状态。
- `server/routes/trades.js`：成交记录接口，对应 `trade_record` 表，负责新增成交回报、查询成交记录，并通过成交编号避免重复写入。
- `server/routes/alerts.js`：价格提醒接口，对应 `price_alert` 表，负责新增提醒、查询提醒、触发提醒、停用提醒。
- `server/routes/notifications.js`：提醒通知接口，对应 `alert_notification` 表，负责新增通知、查询通知、标记通知已读。

## 数据库目录 `database/`

```text
database/
└── schema.sql
```

- `database/schema.sql`：MySQL 建表脚本，创建交易客户端本地数据库 `trading_client` 以及 5 张业务表：
  - `login_session`：登录会话表。
  - `order_record`：委托记录表。
  - `trade_record`：成交回报表。
  - `price_alert`：价格提醒规则表。
  - `alert_notification`：提醒通知表。

## 按分工查找文件

- 资金账户系统/证券账户系统对接：主要看 `js/account-api.js`，必要时看 `js/business.js`。
- 中央交易系统/交易管理系统对接：主要看 `js/central-api.js`、`js/management-api.js`，必要时看 `js/business.js`。
- 交易客户端数据库/后端持久化：主要看 `server/`、`database/schema.sql`、`js/client-api.js`。
- 前端页面和样式调整：主要看 `index.html`、`styles.css`、`js/render.js`。
- 本地演示数据调整：主要看 `js/mock-data.js`。
- 项目文档和分工说明：主要看 `README.md`、`INTERFACES.md`、`DATABASE.md`、`TEAM_WORK.md`。
