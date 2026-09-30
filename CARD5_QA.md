# 카드 5 전체 자료 내보내기 검증

확인일: 2026-09-30 (서울). 로컬 주소: http://127.0.0.1:5176/

## 구현

- 화면 맨 아래 ‘05 전체 자료 내보내기’의 ‘JSON 파일 다운로드’ 버튼.
- GET /api/export는 다섯 표를 D1의 읽기 전용 batch 한 번으로 조회한다.
- plans, plan_versions, tasks, study_logs, plan_reviews의 모든 행·열을 포함한다.
- 이전 계획 버전과 삭제한 자료도 포함해 ID 연결을 보존한다. 테스트 기록도 포함한다.
- 원본 열 이름·값·null·tags JSON 문자열·분 단위·UTC 시각·달력 날짜를 유지한다.
- exportVersion 1, schemaVersion 2, exportedAt, timezone, timeUnit, includesDeleted와 전체 schemaContract를 포함한다.
- UTF-8 JSON 첨부 파일, UTC 시각을 담은 파일명, Cache-Control: no-store, nosniff 헤더.
- 비어 있는 DB는 다섯 빈 배열을 내보낸다. 오류는 503과 안내 문구를 반환하고 첨부 파일을 만들지 않는다.
- 다운로드 진행 중 버튼 비활성화와 중복 클릭 방지. 실패 후 버튼으로 재시도할 수 있다.
- 저장하지 않은 입력 제외. 재가져오기 기능은 이 구현에 포함하지 않는다.

## 검증 결과

타입 검사(`tsc --noEmit`)와 `node scripts/run-framework.mjs build` 통과.

`node --experimental-vm-modules scripts/check-export-api.mjs` 통과.
프로젝트의 실제 SQL 마이그레이션으로 메모리 SQLite를 만들고 실제 내보내기 코드와 API를 실행한다.
빈 DB와 검증용 자료에 대해 모든 표의 모든 열을 원본 SQL 조회 결과와 대조했다.
이력, 삭제한 할 일과 실행 기록, 다음 계획 관계, null, 완료 시각, tags, 날짜·분 단위,
한글·일본어·스크립트 형태의 문자열 보존, DB 미연결·조회 실패 시 안전한 오류를 검사했다.
검증용 자료는 메모리에서만 만들었다.

PDS_TEST_ORIGIN과 PDS_TEST_DB_FILE을 지정한 실제 로컬 D1 대조도 통과했다.
계획 2개, 수정 이력 3건, 할 일 5개, 공부 기록 2건, 저장된 돌아보기 0건이다.
사용자 자료를 생성·수정·삭제하지 않았다.

앱 안 브라우저에서 다운로드 버튼을 눌러 성공 안내와 버튼 복귀를 확인했다.
실제 Downloads 폴더에 JSON 파일이 저장되었고, 그 파일의 다섯 표 값도 API 결과와 대조했다.
브라우저 자동화의 다운로드 완료 이벤트는 감지하지 못했으나 파일 저장 자체는 확인했다.
화면 폭이 좁을 때 버튼과 안내문이 세로로 배치되는 것을 확인했다.

## 재확인 명령 (PowerShell, site 폴더)

```powershell
node node_modules/typescript/bin/tsc --noEmit
node --experimental-vm-modules scripts/check-export-api.mjs
$env:PDS_TEST_ORIGIN = 'http://127.0.0.1:5176'
$dbFile = Get-ChildItem -LiteralPath '.wrangler/state/v3/d1/miniflare-D1DatabaseObject' -Filter '*.sqlite' | Where-Object { $_.Name -ne 'metadata.sqlite' } | Select-Object -First 1
$env:PDS_TEST_DB_FILE = $dbFile.FullName
node --experimental-vm-modules scripts/check-export-api.mjs
```

다음은 실제 학습 자료 정리, 돌아보기 개선점 저장, 최종 기능·보안 검증, 배포·제출 자료 준비다.
