# Git-Flow And Commit Rules

## 목적

FaithLog frontend의 브랜치, 커밋 메시지, 로컬 Git hook 설치 기준을 정의한다. 이 문서는 팀 협업 기준이며, 실제 검증은 `.githooks/`와 `scripts/validate-*.js`에서 수행한다.

## 브랜치 전략

- `main`: 배포 가능한 안정 버전만 둔다.
- `develop`: PR 기본 대상 브랜치이며 기능 통합 기준이다.
- `feature/<slug>`: 사용자 기능 추가.
- `bugfix/<slug>`: 개발 중 버그 수정.
- `hotfix/<slug>`: 배포 브랜치 긴급 수정.
- `release/v<major>.<minor>.<patch>`: 릴리스 준비.
- `chore/<slug>`, `docs/<slug>`, `test/<slug>`, `refactor/<slug>`, `ci/<slug>`, `build/<slug>`, `perf/<slug>`: 목적이 분명한 비기능 작업.
- `codex/issue-<number>-<slug>`: Codex 이슈 단위 작업 브랜치.

브랜치 slug는 소문자 영문, 숫자, 하이픈만 사용한다.

```bash
codex/issue-1-git-hooks-templates
feature/login-screen
bugfix/api-error-state
release/v1.2.0
```

## 커밋 메시지 규칙

커밋 제목은 Conventional Commits 계열 형식을 사용한다.

```text
<type>(optional-scope): <subject>
```

허용 type:

- `feat`: 사용자 기능 추가
- `fix`: 버그 수정
- `docs`: 문서 변경
- `style`: 포맷 또는 스타일만 변경
- `refactor`: 동작 변경 없는 구조 개선
- `perf`: 성능 개선
- `test`: 테스트 추가 또는 수정
- `build`: 빌드 시스템 또는 dependency 변경
- `ci`: CI/CD 설정 변경
- `chore`: 기타 유지보수
- `revert`: 변경 되돌림

예시:

```text
chore(git): add hooks and templates
docs: update release checklist
fix(api): handle invalid envelope
```

`Merge`, `Revert`, `fixup!`, `squash!` 커밋은 Git 작업 흐름을 위해 hook에서 허용한다.

## Git hook 설치

이 저장소는 실제 `.git/hooks`를 커밋하지 않고, versioned hook template을 `.githooks/`에 둔다. 새 checkout에서는 아래 명령으로 hook 경로를 등록한다.

```bash
npm run hooks:install
```

설치 후 적용되는 검증:

- `pre-commit`: 현재 브랜치 이름 규칙 검증
- `commit-msg`: 커밋 메시지 형식 검증

검증만 실행할 때:

```bash
npm run hooks:validate:branch -- codex/issue-1-git-hooks-templates
npm run hooks:validate:commit -- "chore(git): add hooks and templates"
```

## 예외와 우회

자동화, rebase, 긴급 복구처럼 hook을 일시적으로 우회해야 할 때만 아래 방법을 사용한다.

```bash
SKIP_GIT_HOOKS=1 git commit -m "chore(git): add hooks and templates"
git commit --no-verify -m "chore(git): add hooks and templates"
```

우회한 커밋도 PR 전에는 이 문서의 규칙을 만족하도록 정리한다. secret, token, private key, Firebase config 값은 커밋 메시지, PR 본문, Issue 본문, hook 로그에 남기지 않는다.
