<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Deploy-Token');

function respond($payload, $status = 200) {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail_response($message, $status = 500) {
    respond(['result' => 'Error', 'errorMsg' => $message], $status);
}

function load_env_file($path) {
    if (!is_file($path)) {
        throw new Exception("서버 env 파일이 없습니다: {$path}");
    }

    $values = [];
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        throw new Exception("서버 env 파일을 읽을 수 없습니다: {$path}");
    }

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') {
            continue;
        }
        $separator = strpos($line, '=');
        if ($separator === false) {
            continue;
        }
        $key = trim(substr($line, 0, $separator));
        $value = trim(substr($line, $separator + 1));
        $values[$key] = trim($value, "\"'");
    }

    return $values;
}

function request_header($name) {
    $server_key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    if (isset($_SERVER[$server_key])) {
        return trim((string)$_SERVER[$server_key]);
    }
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $header_name => $header_value) {
            if (strcasecmp($header_name, $name) === 0) {
                return trim((string)$header_value);
            }
        }
    }
    return '';
}

function remove_tree($path) {
    if (!file_exists($path) && !is_link($path)) {
        return;
    }
    if (is_file($path) || is_link($path)) {
        if (!unlink($path)) {
            throw new Exception("파일을 삭제할 수 없습니다: {$path}");
        }
        return;
    }

    $items = scandir($path);
    if ($items === false) {
        throw new Exception("디렉토리를 읽을 수 없습니다: {$path}");
    }
    foreach ($items as $item) {
        if ($item !== '.' && $item !== '..') {
            remove_tree($path . DIRECTORY_SEPARATOR . $item);
        }
    }
    if (!rmdir($path)) {
        throw new Exception("디렉토리를 삭제할 수 없습니다: {$path}");
    }
}

function validate_zip($zip, $prefix) {
    for ($index = 0; $index < $zip->numFiles; $index += 1) {
        $name = $zip->getNameIndex($index);
        if ($name === false || $name === '') {
            throw new Exception('zip 내부 파일명을 읽을 수 없습니다.');
        }
        $normalized = str_replace('\\', '/', $name);
        $has_parent = strpos($normalized, '../') !== false || preg_match('#(^|/)\.\.($|/)#', $normalized);
        $has_absolute = $normalized[0] === '/' || preg_match('#^[a-zA-Z]:/#', $normalized);
        if (strpos($normalized, "\0") !== false || $has_parent || $has_absolute) {
            throw new Exception("zip 내부에 허용되지 않는 경로가 있습니다: {$name}");
        }
        if ($normalized !== $prefix && strpos($normalized, $prefix . '/') !== 0) {
            throw new Exception("zip 내부 파일은 {$prefix}/ 폴더 아래에 있어야 합니다: {$name}");
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail_response('POST 메서드만 허용됩니다.', 405);
}

$uploaded_path = null;
try {
    $web_root = '/share/Web';
    $target_dir = $web_root . '/breakout';
    $uploaded_path = $web_root . '/breakout.zip';
    $env = load_env_file($web_root . '/.breakout_deploy.env');
    $expected_token = trim((string)($env['BREAKOUT_DEPLOY_TOKEN'] ?? ''));

    if (!class_exists('ZipArchive')) {
        throw new Exception('PHP ZipArchive 확장이 필요합니다.');
    }
    if (!is_dir($web_root) || !is_writable($web_root)) {
        throw new Exception("웹 루트에 쓰기 권한이 없습니다: {$web_root}");
    }
    if ($expected_token === '') {
        throw new Exception('서버 env 파일에 BREAKOUT_DEPLOY_TOKEN 값이 없습니다.');
    }

    $provided_token = request_header('X-Deploy-Token');
    if ($provided_token === '' || !hash_equals($expected_token, $provided_token)) {
        fail_response('배포 토큰이 올바르지 않습니다.', 401);
    }
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        throw new Exception('zip 파일 업로드에 실패했습니다.');
    }
    if (strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION)) !== 'zip') {
        throw new Exception('zip 파일만 업로드할 수 있습니다.');
    }
    if (file_exists($uploaded_path) && !unlink($uploaded_path)) {
        throw new Exception("기존 zip 파일을 삭제할 수 없습니다: {$uploaded_path}");
    }
    if (!move_uploaded_file($_FILES['file']['tmp_name'], $uploaded_path)) {
        throw new Exception("zip 파일 저장 실패: {$uploaded_path}");
    }
    chmod($uploaded_path, 0644);

    $zip = new ZipArchive();
    $open_result = $zip->open($uploaded_path);
    if ($open_result !== true) {
        throw new Exception("zip 파일을 열 수 없습니다. ZipArchive code: {$open_result}");
    }
    validate_zip($zip, 'breakout');
    remove_tree($target_dir);
    if (!$zip->extractTo($web_root)) {
        $zip->close();
        throw new Exception("zip 압축 해제 실패: {$web_root}");
    }
    $zip->close();

    if (!is_file($target_dir . '/index.html')) {
        throw new Exception('압축 해제 후 breakout/index.html을 찾을 수 없습니다.');
    }
    if (!unlink($uploaded_path)) {
        throw new Exception("배포 후 zip 파일을 삭제할 수 없습니다: {$uploaded_path}");
    }
    $uploaded_path = null;
    respond([
        'result' => 'OK',
        'action' => 'deploy',
        'deploy_dir' => $target_dir,
        'public_url' => 'https://cheng80.myqnapcloud.com/breakout/',
        'message' => 'breakout 웹 빌드 배포가 완료되었습니다.',
    ]);
} catch (Throwable $error) {
    if ($uploaded_path !== null && file_exists($uploaded_path)) {
        @unlink($uploaded_path);
    }
    fail_response($error->getMessage());
}
