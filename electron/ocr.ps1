# 用 Windows 內建 OCR 辨識圖片文字（不需安裝任何軟體、不連網）
# 參數：-ListFile  一個 UTF-8 JSON 檔，內容是圖片路徑陣列
#       -Lang      ja / zh-Hant-TW / en-US
# 輸出：JSON 陣列，每張圖一個元素，元素是辨識出的各行文字
param([string]$ListFile, [string]$Lang = 'ja')

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($op, [Type]$type) {
  $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}

$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($Lang))
if ($null -eq $engine) { throw "這台電腦沒有安裝 $Lang 的 OCR 語言套件" }

$paths = Get-Content -LiteralPath $ListFile -Raw -Encoding UTF8 | ConvertFrom-Json
$out = New-Object System.Collections.ArrayList
foreach ($p in $paths) {
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($p)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $lines = @($result.Lines | ForEach-Object { $_.Text })
  [void]$out.Add($lines)
  $stream.Dispose()
}
ConvertTo-Json -InputObject @($out) -Depth 4 -Compress
