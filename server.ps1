param([int]$Port = 38471, [switch]$NoBrowser)

# SECURITY INTENT: this process is a loopback-only bridge. Browsers cannot call
# Yituliu directly because of CORS, so the token travels page -> 127.0.0.1 ->
# Yituliu. Request bodies and tokens are never printed or persisted.
$ErrorActionPreference = 'Stop'
[void][Reflection.Assembly]::LoadWithPartialName('System.Net.Http')
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$rootPath = [IO.Path]::GetFullPath($PSScriptRoot)
$indexPath = Join-Path $rootPath 'index.html'
if (-not (Test-Path -LiteralPath $indexPath)) { throw "Missing index.html: $indexPath" }

function Read-HttpRequest([System.Net.Sockets.NetworkStream]$stream) {
    $headerBytes = New-Object System.Collections.Generic.List[byte]
    while ($true) {
        $value = $stream.ReadByte()
        if ($value -lt 0) { return $null }
        $headerBytes.Add([byte]$value)
        $count = $headerBytes.Count
        if ($count -ge 4 -and $headerBytes[$count-4] -eq 13 -and $headerBytes[$count-3] -eq 10 -and $headerBytes[$count-2] -eq 13 -and $headerBytes[$count-1] -eq 10) { break }
        if ($count -gt 65536) { throw 'Request headers too large' }
    }
    $headerText = [Text.Encoding]::ASCII.GetString($headerBytes.ToArray())
    $lines = $headerText -split "`r`n"
    $first = $lines[0] -split ' '
    if ($first.Count -lt 2) { throw 'Invalid HTTP request line' }
    $headers = @{}
    foreach ($line in $lines[1..($lines.Count-1)]) {
        if ($line -match '^([^:]+):\s*(.*)$') { $headers[$matches[1].ToLowerInvariant()] = $matches[2] }
    }
    $length = 0
    if ($headers.ContainsKey('content-length')) { $length = [int]$headers['content-length'] }
    if ($length -gt 4194304) { throw 'Request body too large' }
    $bodyBytes = New-Object byte[] $length
    $offset = 0
    while ($offset -lt $length) {
        $read = $stream.Read($bodyBytes, $offset, $length - $offset)
        if ($read -le 0) { break }
        $offset += $read
    }
    $rawPath = ($first[1] -split '\?')[0]
    [pscustomobject]@{
        Method = $first[0].ToUpperInvariant()
        Path = [Uri]::UnescapeDataString($rawPath)
        Headers = $headers
        Body = [Text.Encoding]::UTF8.GetString($bodyBytes, 0, $offset)
    }
}

function Write-HttpResponse([System.Net.Sockets.NetworkStream]$stream, [int]$status, [string]$contentType, [byte[]]$bytes) {
    $reason = switch ($status) {
        200 {'OK'} 400 {'Bad Request'} 404 {'Not Found'} 413 {'Payload Too Large'}
        500 {'Internal Server Error'} 502 {'Bad Gateway'} default {'Response'}
    }
    $securityHeaders = "Cache-Control: no-store`r`nX-Content-Type-Options: nosniff`r`nReferrer-Policy: no-referrer`r`nContent-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`r`n"
    $head = "HTTP/1.1 $status $reason`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`n$securityHeaders" + "Connection: close`r`n`r`n"
    $headBytes = [Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($headBytes, 0, $headBytes.Length)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
}

function Write-TextResponse([System.Net.Sockets.NetworkStream]$stream, [int]$status, [string]$contentType, [string]$body) {
    Write-HttpResponse $stream $status $contentType ([Text.Encoding]::UTF8.GetBytes($body))
}

function Json-Response([bool]$ok, [int]$status, $data, [string]$message = '') {
    @{ ok = $ok; status = $status; data = $data; message = $message } | ConvertTo-Json -Depth 40 -Compress
}

function Invoke-Upstream([string]$method, [string]$path, [string]$token = '', $payload = $null) {
    if ($path -ne '/survey/operator/result/v2' -and [string]::IsNullOrWhiteSpace($token)) { throw 'Token 不能为空' }
    $handler = New-Object Net.Http.HttpClientHandler
    $client = New-Object Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(30)
    try {
        $request = New-Object Net.Http.HttpRequestMessage((New-Object Net.Http.HttpMethod($method)), "https://backend.yituliu.cn$path")
        [void]$request.Headers.TryAddWithoutValidation('Accept', 'application/json')
        if (-not [string]::IsNullOrWhiteSpace($token)) {
            [void]$request.Headers.TryAddWithoutValidation('Authorization', $token.Trim())
        }
        if ($null -ne $payload) {
            $json = $payload | ConvertTo-Json -Depth 40 -Compress
            $request.Content = New-Object Net.Http.StringContent($json, [Text.Encoding]::UTF8, 'application/json')
        }
        try { $response = $client.SendAsync($request).GetAwaiter().GetResult() }
        catch {
            $detail = $_.Exception.Message
            if ($null -ne $_.Exception.InnerException) { $detail = $_.Exception.InnerException.Message }
            throw "无法连接一图流后端，请检查网络、系统时间或证书：$detail"
        }
        $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $parsed = $null
        try { $parsed = $text | ConvertFrom-Json } catch { $parsed = @{ raw = $text } }
        $errorMessage = ''
        if (-not $response.IsSuccessStatusCode) {
            if ($null -ne $parsed.message) { $errorMessage = [string]$parsed.message }
            elseif ($null -ne $parsed.msg) { $errorMessage = [string]$parsed.msg }
            else { $errorMessage = "HTTP $([int]$response.StatusCode)" }
        }
        [pscustomobject]@{ Ok = $response.IsSuccessStatusCode; Status = [int]$response.StatusCode; Data = $parsed; Message = $errorMessage }
    } finally {
        $client.Dispose()
        $handler.Dispose()
    }
}

function Get-MimeType([string]$path) {
    switch ([IO.Path]::GetExtension($path).ToLowerInvariant()) {
        '.html' {'text/html; charset=utf-8'}
        '.css' {'text/css; charset=utf-8'}
        '.js' {'text/javascript; charset=utf-8'}
        '.json' {'application/json; charset=utf-8'}
        '.svg' {'image/svg+xml'}
        '.png' {'image/png'}
        default {'application/octet-stream'}
    }
}

function Resolve-StaticPath([string]$requestPath) {
    $relative = $requestPath.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
    if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
    $candidate = [IO.Path]::GetFullPath((Join-Path $rootPath $relative))
    $prefix = $rootPath.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $candidate.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -and $candidate -ne $indexPath) { return $null }
    return $candidate
}

$listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
try { $listener.Start() }
catch {
    Write-Host "无法启动：端口 $Port 可能已被占用。请先关闭旧的工具窗口。" -ForegroundColor Red
    Read-Host '按 Enter 退出'
    exit 1
}

$url = "http://127.0.0.1:$Port/"
Write-Host '一图流本地干员工作台已启动' -ForegroundColor Cyan
Write-Host "地址：$url"
Write-Host '此窗口必须保持打开；按 Ctrl+C 停止。Token 不会写入文件或日志。' -ForegroundColor Yellow
if (-not $NoBrowser) {
    try { Start-Process $url }
    catch {
        # Browser launch is convenience-only. Security software or a restricted
        # shell may block it; keep the local server useful and show the exact URL.
        Write-Host "浏览器未能自动打开，请手动访问：$url" -ForegroundColor Yellow
    }
}

try {
    while ($true) {
        $tcpClient = $listener.AcceptTcpClient()
        $stream = $null
        try {
            $tcpClient.ReceiveTimeout = 35000
            $stream = $tcpClient.GetStream()
            $request = Read-HttpRequest $stream
            if ($null -eq $request) { continue }

            if ($request.Method -eq 'GET' -and $request.Path -eq '/health') {
                Write-TextResponse $stream 200 'application/json; charset=utf-8' (Json-Response $true 200 @{ service = 'yituliu-local-workbench'; loopback = $true })
                continue
            }

            if ($request.Method -eq 'POST' -and $request.Path -in @('/api/read', '/api/write', '/api/statistics')) {
                try { $inputData = if ([string]::IsNullOrWhiteSpace($request.Body)) { @{} } else { $request.Body | ConvertFrom-Json } }
                catch { throw '请求 JSON 格式错误' }
                if ($request.Path -eq '/api/read') {
                    $upstream = Invoke-Upstream 'Get' '/open-api/operator/info' $inputData.token
                } elseif ($request.Path -eq '/api/write') {
                    if ($null -eq $inputData.payload -or $null -eq $inputData.payload.operatorDataList) { throw '缺少上传数据' }
                    $upstream = Invoke-Upstream 'Post' '/open-api/operator/upload' $inputData.token $inputData.payload
                } else {
                    # Public aggregate statistics contain no user credentials.
                    $upstream = Invoke-Upstream 'Get' '/survey/operator/result/v2'
                }
                Write-TextResponse $stream 200 'application/json; charset=utf-8' (Json-Response $upstream.Ok $upstream.Status $upstream.Data $upstream.Message)
                continue
            }

            if ($request.Method -eq 'GET') {
                $filePath = Resolve-StaticPath $request.Path
                if ($null -ne $filePath -and (Test-Path -LiteralPath $filePath -PathType Leaf)) {
                    Write-HttpResponse $stream 200 (Get-MimeType $filePath) ([IO.File]::ReadAllBytes($filePath))
                } else {
                    Write-TextResponse $stream 404 'application/json; charset=utf-8' (Json-Response $false 404 $null 'Not found')
                }
                continue
            }

            Write-TextResponse $stream 404 'application/json; charset=utf-8' (Json-Response $false 404 $null 'Not found')
        } catch {
            try { Write-TextResponse $stream 502 'application/json; charset=utf-8' (Json-Response $false 502 $null $_.Exception.Message) } catch {}
        } finally {
            if ($null -ne $stream) { $stream.Dispose() }
            $tcpClient.Dispose()
        }
    }
} finally {
    $listener.Stop()
}
