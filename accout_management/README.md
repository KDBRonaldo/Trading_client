# 账户管理子系统

本项目实现证券账户、资金账户及其前后端联动，包含工作人员管理端、投资者端、外部联调接口和 MySQL 数据落库。

## 当前版本范围

- 工作人员端
  - 登录、首登证书认证、Dashboard
  - 证券账户开户、挂失、补办、销户、资料修改
  - 资金账户开户、存款、取款、改密、挂失、补办、销户、绑定/解绑
  - 资金流水查询
  - 操作日志查询
- 投资者端
  - 登录、首登证书认证
  - 资金快照、证券快照
  - 修改交易/取款密码
  - 页面路由鉴权与刷新保活
- 外部接口
  - 资金快照
  - 证券快照
  - 资金回调
  - 持仓回调
  - 管理员冻结/解冻/强制销户/结息接口

## 已落地的重要规则

- 首次登录必须进入证书认证页，认证通过后才发放 token。
- 演示证书码固定为 `CERT-123456`。
- 未登录直接访问业务页会被拦截回 `/login`。
- 页面刷新不会直接清掉登录态；显式退出、端间切换时才清除。
- Dashboard 账户总数不统计已销户账户。
- 黑名单命中时禁止开户；黑名单服务不可达时记录 warning 并默认放行。
- 资金账户挂失时：
  - 可用余额会整体转入冻结余额
  - 关联证券账户转为冻结
  - 持仓数量整体转入冻结持仓
- 资金账户补办时：
  - 新资金账户继承原资金总额
  - 老资金账户转为已销户且余额清零
  - 关联证券账户自动重新绑定并解冻
  - 持仓自动转回可用持仓
- 资金流水页面会展示：
  - 流水类型
  - 金额变化
  - 可用/冻结余额变化
  - 关联股票名称、股票代码、股数变化量
- 操作日志会记录对应工作人员，并带关联证券账户号/资金账户号。

## 当前约定与已知差异

- 投资者自助银证转账页面目前仅保留余额展示与表单校验，真实转账接口未开放。
- 首登证书认证为课程项目中的演示实现，不接真实 CA/USBKey。
- 管理员外部接口仍复用内部 `X-Staff-Auth-Token` 鉴权，可使用内部管理员账号调用。

## 环境要求

- JDK 17+
- Maven 3.9+
- Node.js 18+
- MySQL 8.0，Windows 服务名默认 `MySQL80`

默认环境参数：

- 数据库：`account_db`
- MySQL 账号：`root`
- MySQL 密码：`MutsumiLZZ520!`
- 黑名单服务：`http://10.196.95.30:8081`

## 一键启动

项目根目录：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-all.ps1
```

如需强制重建库并重新灌入基础 staff 数据：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-all.ps1 -ResetDb
```

启动完成后：

- 前端：`http://localhost:5173/login`
- 后端：`http://localhost:8080`

## 一键停止

```powershell
powershell -ExecutionPolicy Bypass -File .\stop-all.ps1
```

如需连 MySQL 一起停掉，请使用管理员 PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\stop-all.ps1 -StopMySql
```

## 默认可用账号

`start-all.ps1 -ResetDb` 或首次初始化后会写入以下基础工作人员账号：

- `staff01` ~ `staff10`
- `tradeadmin`

统一密码：

- `123456`

首次登录流程：

1. 打开 `http://localhost:5173/login`
2. 输入账号密码
3. 系统跳转 `/certificate`
4. 输入 `CERT-123456`
5. 认证成功后进入对应业务端

## 数据库结构与脚本

核心脚本位于 `scripts/`：

- `mysql_schema_current.sql`
  - 当前实际表结构
  - 包含 `login_certificate_state`
- `mysql_seed_smoke.sql`
  - 启动时使用的最小可用 staff 种子
- `01_create_tables.sql` / `02_views.sql` / `03_test_data.sql` / `04_optional_procedures.sql`
  - 原始课程脚本保留

## 常用本地验证

后端测试：

```powershell
mvn -q "-Daccount.test.mysql.username=root" "-Daccount.test.mysql.password=MutsumiLZZ520!" test
```

前端构建：

```powershell
cd frontend
npm run build
```

本仓库已于 `2026-06-20` 本地验证：

- `mvn test` 通过
- `frontend npm run build` 通过

## 目录说明

- `src/main/java/account`
  - Spring Boot 后端代码
- `frontend/src/app`
  - React 前端代码
- `scripts`
  - 启动、初始化、数据库脚本
- `docs`
  - 实验大纲、测试报告、最终测试流程说明

## 主要文档

- [账户业务完整测试流程](docs/账户业务完整测试流程.md)

## 管理员与联调接口说明

- 内部管理端接口前缀：`/api/internal/...`
- 投资者端接口前缀：`/api/external/...`
- 管理员联调接口前缀：`/api/admin/...`
- 管理员联调接口当前仍要求 `X-Staff-Auth-Token`
- 建议联调使用 `tradeadmin / 123456`

## 不随仓库提交的本地产物

以下内容仅用于本地调试，不建议入库：

- `logs/`
- `frontend/dist/`
- `frontend/test-results/`
- 本地自动化回归脚本与 Playwright 产物
