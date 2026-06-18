# Injection And Query Safety

## 목적

React Native frontend에서 URL query, API filter, search params, GraphQL, deep link, analytics/logging으로 사용자 입력이 전달될 때 query injection / parameter injection 위험을 줄이기 위한 규칙을 정의한다.

Frontend가 책임질 수 있는 validation, encoding, allowlist, UX 방어와 backend/API layer가 반드시 책임져야 하는 parameterized query, authorization, server-side validation을 분리한다.

## 핵심 원칙

- 사용자 입력은 query, filter, sort, search, deep link, navigation params, GraphQL variables, analytics, logging 어디로 전달되든 신뢰하지 않는다.
- 문자열 조립 대신 typed params, safe encoding, allowlist, runtime validation, narrowing을 사용한다.
- encoding은 validation을 대체하지 않는다.
- validation은 값이 안전하게 인코딩 가능한지뿐 아니라 비즈니스적으로 허용되는지도 확인한다.
- frontend validation은 UX와 defense-in-depth 목적이며, injection 차단의 최종 책임은 backend/API layer의 parameterized query, 권한 검증, 서버 측 validation에 있다.
- injection 방어가 frontend만으로 끝났다고 판단하지 않는다.

## frontend에서 해야 할 것

- URL query string을 문자열 이어붙이기로 만들지 않는다.
- `URLSearchParams` 또는 프로젝트에서 채택한 안전한 encoder/helper를 사용한다.
- 사용자 입력을 query, filter, sort, search params로 넘기기 전에 runtime validation/narrowing을 수행한다.
- deep link params, navigation params, search input, storage 복원 데이터, push payload를 API query로 넘기기 전에 검증한다.
- sort key, sort direction, filter field, search type, pagination limit 같은 값은 allowlist 기반으로 제한한다.
- allowlist는 가능한 값의 집합을 명시하고, denylist 방식에 의존하지 않는다.
- pagination limit, page size, date range 같은 값은 허용 범위로 clamp한다.
- enum-like 값은 unknown string으로 처리하지 말고 명시적인 union으로 좁힌다.
- analytics event name, logging field, tracking parameter에도 사용자 입력을 그대로 넣지 않는다.
- 로그에는 raw query, token, email, phone number, 주소, 개인 식별자 등 민감 정보가 노출되지 않도록 masking한다.
- 검색어는 필요 시 trim, length limit, normalization을 적용한다.
- GraphQL을 프로젝트에서 채택한 경우 user input은 query template 문자열에 직접 삽입하지 않고 variables로 전달한다.
- GraphQL의 dynamic field selection, dynamic orderBy, dynamic filter key는 allowlist를 통과한 값만 사용한다.
- Supabase, Firebase, search API 등을 프로젝트에서 채택한 경우 raw filter/query string 조립보다 SDK의 typed method, parameterized method, safe builder를 우선 사용한다.
- PostgREST-style query, search syntax, full-text search syntax, NoSQL where 조건을 직접 문자열로 만들 때는 특히 주의한다.
- 검색 서비스가 advanced query syntax를 지원하면 사용자 입력이 연산자로 해석되지 않도록 escape, quote, syntax disable 가능성을 검토한다.

## frontend에서 피해야 할 것

- `'?q=' + input` 같은 문자열 연결 방식.
- `` `/items?sort=${sort}&filter=${filter}` ``처럼 검증되지 않은 값을 직접 URL에 삽입하는 방식.
- user input을 GraphQL query string 안에 직접 넣는 방식.
- deep link param을 검증 없이 API filter로 전달하는 방식.
- navigation param을 신뢰하고 권한이 필요한 API query에 그대로 사용하는 방식.
- raw SQL, raw filter, raw search syntax, raw query fragment를 client에서 조립하는 방식.
- 사용자 입력으로 collection, table, field, operator 이름을 직접 선택하게 하는 방식.
- frontend validation만으로 injection이 방어됐다고 판단하는 것.
- client에서 숨긴 값이나 제한을 보안 경계로 간주하는 것.

## backend/API contract로 요구할 것

- 서버는 parameterized query 또는 안전한 query builder를 사용해야 한다.
- 서버는 모든 query/filter/sort/search params를 validation해야 한다.
- 서버는 사용자 권한을 매 요청마다 검증해야 한다.
- 서버는 client에서 넘어온 userId, role, organizationId, permission flag를 그대로 신뢰하지 않아야 한다.
- 서버는 허용되지 않은 field, operator, sort, filter를 거부해야 한다.
- 서버는 pagination limit, date range, search length, request size 제한을 적용해야 한다.
- 서버는 authorization과 data access control을 frontend에 위임하지 않아야 한다.
- API contract에는 허용되는 params, enum 값, 기본값, 최대값, 실패 응답 형식이 명시되어야 한다.
- GraphQL variables를 사용하더라도 서버 측 authorization과 validation을 수행해야 한다.

## 판단 기준

- 사용자 입력이 URL, API params, GraphQL, search API, analytics, logging으로 전달되는가?
- 그 값이 외부 입력인지, 내부에서 생성한 신뢰 가능한 값인지 구분했는가?
- 외부 입력이라면 validation/narrowing을 거쳤는가?
- 문자열 조립 대신 encoder, typed params, SDK method, variables를 사용했는가?
- sort/filter/search key가 allowlist를 통과했는가?
- frontend 제한을 우회해도 backend가 안전한가?
- 실패 시 safe default, fallback, 명시적인 error state 중 하나가 있는가?

## 체크리스트

- [ ] URL query string을 문자열 연결로 만들지 않았다.
- [ ] query/filter/sort/search params에 allowlist를 적용했다.
- [ ] deep link/navigation/storage/push payload 값을 검증했다.
- [ ] GraphQL user input은 variables로 전달했다.
- [ ] raw filter/query/search syntax를 직접 조립하지 않았다.
- [ ] 검색어 length limit, trim, normalization 필요성을 검토했다.
- [ ] pagination/page size/date range에 상한을 적용했다.
- [ ] 로그와 analytics에 raw user input 또는 민감 정보가 들어가지 않는다.
- [ ] backend가 parameterized query와 서버 측 validation을 제공한다는 API contract를 확인했다.
- [ ] frontend validation만으로 보안이 끝났다고 판단하지 않았다.

## 예시 패턴

```ts
// bad: 문자열 연결로 query string 생성
const unsafeUrl = `/items?q=${input}&sort=${sort}`;

// good: validation 후 안전한 encoder 사용
type SortKey = 'createdAt' | 'title';
type SortDirection = 'asc' | 'desc';

const sortKeys = ['createdAt', 'title'] as const;
const sortDirections = ['asc', 'desc'] as const;

function isSortKey(value: string): value is SortKey {
  return (sortKeys as readonly string[]).includes(value);
}

function isSortDirection(value: string): value is SortDirection {
  return (sortDirections as readonly string[]).includes(value);
}

function clampPageSize(value: number): number {
  return Math.min(Math.max(value, 1), 50);
}

function buildItemQuery(input: {
  search: string;
  sort: string;
  direction: string;
  pageSize: number;
}) {
  const params = new URLSearchParams();
  const search = input.search.trim().slice(0, 100);
  const sort = isSortKey(input.sort) ? input.sort : 'createdAt';
  const direction = isSortDirection(input.direction) ? input.direction : 'desc';

  params.set('q', search);
  params.set('sort', sort);
  params.set('direction', direction);
  params.set('limit', String(clampPageSize(input.pageSize)));

  return params.toString();
}
```

```ts
// bad: GraphQL query string에 user input 직접 삽입
const unsafeQuery = `
  query {
    items(search: "${search}") {
      id
      title
    }
  }
`;

// good: variables 사용
const query = `
  query Items($search: String!) {
    items(search: $search) {
      id
      title
    }
  }
`;

const variables = {search: search.trim().slice(0, 100)};
```

```ts
// bad: deep link param을 API filter로 바로 전달
function openItems(params: {filter?: string}) {
  return `/items?filter=${params.filter}`;
}

// good: validation 후 domain-safe param으로 변환
type ItemFilter = 'owned' | 'shared' | 'archived';

function toItemFilter(value: unknown): ItemFilter {
  if (value === 'owned' || value === 'shared' || value === 'archived') {
    return value;
  }
  return 'owned';
}

function openItemsSafely(params: {filter?: unknown}) {
  const query = new URLSearchParams({filter: toItemFilter(params.filter)});
  return `/items?${query.toString()}`;
}
```
