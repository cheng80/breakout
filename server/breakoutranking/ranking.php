<?php
/**
 * Swipe Breakout 점수 랭킹 API.
 *
 * GET  ?action=list&limit=10 → 상위 점수 반환
 * POST ?action=submit       → {"name":"...", "score":123, "stage":4, "durationMs":12345}
 *
 * 같은 디렉터리의 ranking_data.json에 최대 30건을 저장합니다.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('MAX_ENTRIES', 30);
define('MAX_NAME_LENGTH', 12);
define('MAX_DURATION_MS', 86400000);

function respond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function dataFile(): string {
    return __DIR__ . '/ranking_data.json';
}

function loadData(): array {
    $file = dataFile();
    if (!file_exists($file)) return [];

    $handle = fopen($file, 'rb');
    if ($handle === false) return [];
    flock($handle, LOCK_SH);
    $raw = stream_get_contents($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    $data = json_decode($raw ?: '[]', true);
    return is_array($data) ? $data : [];
}

function saveData(array $data): void {
    file_put_contents(
        dataFile(),
        json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
        LOCK_EX
    );
}

function durationValue(array $entry): int {
    $duration = filter_var($entry['durationMs'] ?? null, FILTER_VALIDATE_INT);
    return $duration === false || $duration < 0 ? PHP_INT_MAX : $duration;
}

function sortData(array &$data): void {
    usort($data, static function (array $a, array $b): int {
        $scoreOrder = ((int) ($b['score'] ?? 0)) <=> ((int) ($a['score'] ?? 0));
        if ($scoreOrder !== 0) return $scoreOrder;

        $stageOrder = ((int) ($b['stage'] ?? 1)) <=> ((int) ($a['stage'] ?? 1));
        if ($stageOrder !== 0) return $stageOrder;

        $durationOrder = durationValue($a) <=> durationValue($b);
        if ($durationOrder !== 0) return $durationOrder;

        return ((int) ($a['ts'] ?? 0)) <=> ((int) ($b['ts'] ?? 0));
    });
}

function rankedData(array $data, int $limit): array {
    $result = [];
    foreach (array_slice($data, 0, $limit) as $index => $entry) {
        $duration = durationValue($entry);
        $result[] = [
            'rank' => $index + 1,
            'name' => (string) ($entry['name'] ?? ''),
            'score' => (int) ($entry['score'] ?? 0),
            'stage' => (int) ($entry['stage'] ?? 1),
            'durationMs' => $duration === PHP_INT_MAX ? null : $duration,
            'ts' => (int) ($entry['ts'] ?? 0),
        ];
    }
    return $result;
}

$action = $_GET['action'] ?? '';

if ($action === 'list') {
    $limit = min(MAX_ENTRIES, max(1, (int) ($_GET['limit'] ?? 10)));
    $data = loadData();
    sortData($data);
    respond(['ok' => true, 'ranking' => rankedData($data, $limit)]);
}

if ($action !== 'submit') {
    respond(['ok' => false, 'error' => 'unknown action'], 400);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['ok' => false, 'error' => 'POST required'], 405);
}

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) {
    respond(['ok' => false, 'error' => 'JSON body required'], 400);
}

$name = trim((string) ($body['name'] ?? ''));
$score = filter_var($body['score'] ?? null, FILTER_VALIDATE_INT);
$stage = filter_var($body['stage'] ?? 1, FILTER_VALIDATE_INT);
$durationMs = filter_var($body['durationMs'] ?? null, FILTER_VALIDATE_INT);

if ($name === '' || $score === false || $score < 1 || $stage === false || $stage < 1
    || $durationMs === false || $durationMs < 0) {
    respond(['ok' => false, 'error' => 'name, score, stage and durationMs are required'], 400);
}

$name = function_exists('mb_substr')
    ? mb_substr($name, 0, MAX_NAME_LENGTH)
    : substr($name, 0, MAX_NAME_LENGTH);
$stage = min($stage, 999);
$durationMs = min($durationMs, MAX_DURATION_MS);

$data = loadData();
$entry = [
    'name' => $name,
    'score' => $score,
    'stage' => $stage,
    'durationMs' => $durationMs,
    'ts' => time(),
];
$data[] = $entry;
sortData($data);

$rank = null;
foreach (array_slice($data, 0, MAX_ENTRIES) as $index => $candidate) {
    if ($candidate['name'] === $entry['name']
        && (int) $candidate['score'] === $entry['score']
        && (int) $candidate['ts'] === $entry['ts']) {
        $rank = $index + 1;
        break;
    }
}

if ($rank === null) {
    respond([
        'ok' => true,
        'ranked' => false,
        'message' => '상위 ' . MAX_ENTRIES . '위 밖의 점수입니다.',
    ]);
}

$data = array_values(array_slice($data, 0, MAX_ENTRIES));
saveData($data);

respond([
    'ok' => true,
    'ranked' => $rank !== null,
    'rank' => $rank,
    'score' => $score,
    'stage' => $stage,
    'durationMs' => $durationMs,
    'total' => count($data),
]);
