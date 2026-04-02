# モバイルアクセス設定メモ

## アクセス方法

| 項目 | 内容 |
|------|------|
| アクセス URL | `http://100.x.x.x:15173` ※実際の Tailscale IP に置き換える |
| 対応デバイス | iPhone / iPad |
| 必要条件 | Docker・Caddy・Tailscale の3つが起動していること |

URL 入力時は `http://` を省略しないこと（省略すると検索になる）。


## 最終構成

```
iPhone / iPad
    ↓ Tailscale (100.x.x.x:15173)
Windows PC
    ↓ Caddy (0.0.0.0:15173 → localhost:5173)
    ↓ Docker (frontend:5173 → server:3000)
```

- **Tailscale** — iPhone/iPad と PC 間のプライベート VPN
- **Caddy** — 外部からのアクセスを Docker に転送するリバースプロキシ
- **Docker** — アプリ本体（frontend + server + Meilisearch など）


## Caddy の自動起動設定

PC ログオン時に Caddy を自動起動するタスクスケジューラの登録手順。

PowerShell（管理者）で実行：

```powershell
$action = New-ScheduledTaskAction -Execute "C:\caddy\caddy.exe" -Argument "run" -WorkingDirectory "C:\caddy"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -RunLevel Highest
Register-ScheduledTask -TaskName "Caddy Proxy" -Action $action -Trigger $trigger -Principal $principal
```

登録後は PC 再起動 → `http://100.x.x.x:15173` にアクセスして動作確認。

タスクの削除が必要な場合：
```powershell
Unregister-ScheduledTask -TaskName "Caddy Proxy" -Confirm:$false
```


## PC スリープ後のトラブル対処

```powershell
# サーバーが応答しない場合
docker compose restart server

# それでもダメな場合
docker compose down
docker compose up -d
```


## ファイアウォールルール

Caddy のプログラムルールで許可済み（`C:\caddy\caddy.exe`）。
ポート 5173 には直接アクセスできないが、Caddy 経由の 15173 で代替。

確認コマンド：
```powershell
Get-NetFirewallRule -DisplayName "Caddy Proxy Allow" | Select-Object DisplayName, Enabled, Profile
```
