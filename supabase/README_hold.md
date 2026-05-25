##Phase 0 — 제품·정책 먼저 고정 (코드 전)
홀드의 의미
배달만 멈춤 / 메뉴 선택도 멈춤 / 결제는 어떻게 할지(기간 연장 vs 환불 vs 다음 달 정산에 반영)를 한 줄로 정의합니다.
기간 단위 해석

1~3주: KST 기준 7의 배수 일수인지, **월~금 주차(영업 주)**인지(예: “이번 주 월요일부터 2주”)를 정합니다.
1~12개월(1년): 달력 월인지(3/1~3/31), 30일 묶음인지 정합니다.
시작 시점: “신청 즉시 다음 배달 주부터” vs “다음 결제 주기 시작일” 등 앵커 날짜를 정합니다.
이미 잡힌 배달일·메뉴

홀드 구간과 겹치는 delivery_days / user_menu_selections를 삭제·비활성·이동 중 무엇으로 할지, 휴무/캐리오버와 우선순위를 정합니다.
한도·중복

동시에 여러 홀드 허용 여부, 같은 기간 중복 신청, “남은 기간보다 긴 홀드” 방지 규칙을 정합니다.
이 단계에서 PM/운영과 합의하면 이후 DB·API 설계가 흔들리지 않습니다.

##Phase 1 — 데이터 모델 (Supabase)
subscription_holds 테이블(권장)

예시 컬럼: id, subscription_id, user_id, status(requested | active | cancelled | expired), start_date, end_date(반개구간 권장: [start, end)), duration_kind(weeks_1|weeks_2|weeks_3|months_n), created_at, cancelled_at, note
구독 행에만 붙이면 이력·감사·취소가 어려워서 테이블 분리를 추천합니다.
인덱스

(subscription_id, status, start_date), (user_id, status) 등 조회 패턴에 맞춰 인덱스를 잡습니다.
RLS

본인 user_id만 읽기/생성(필요 시 수정), 관리자는 service role 또는 기존 admin 패턴으로 조회.
마이그레이션

로컬/스테이징에만 적용 → 검증 후 프로덕션.

##Phase 2 — 도메인 규칙 (서버 한곳에 모으기)
duration_kind → [start, end) 계산 순수 함수

Phase 0에서 정한 “주/달” 정의를 코드 한 모듈(예: lib/subscription-hold.ts)에만 두고, UI와 API가 공유합니다.
검증 함수

홀드 구간이 현재 구독 기간(period.delivery_start~delivery_end) 안인지(또는 허용할 만큼만 겹치게 할지).
1주3주, 112개월만 허용.
기존 active 홀드와 겹치면 거절 등.
“활성 홀드” 판정
오늘(KST)이 [start, end)에 들어가면 배달/메뉴 로직에서 스킵할지, delivery_days를 비우는지 결정합니다(아래 Phase 3).


##Phase 3 — 기존 기능과의 연동 (핵심)
배달일·메뉴·리포트에 공통 질문 하나
isUserOnHold(userId, subscriptionId, date) 또는 getActiveHoldForDate(...)를 두고, 다음을 순차 적용합니다.
배달 요일 선택 / 저장
메뉴 선택
홈·구독 현황·벤더 리포트의 “그날 배달 있는지”
알림/문자가 있다면 동일 규칙
구현 방식 선택 (둘 중 하나로 통일)
A안(추천): 홀드 승인 시 홀드 구간과 겹치는 delivery_days 행/선택일을 정리(삭제 또는 selected_days에서 해당 요일 제거) + 홀드 테이블로 “의도” 보존. 조회는 단순.
B안: delivery_days는 그대로 두고 조회 시 홀드로 마스킹. 데이터는 남지만 버그 위험이 큼(리포트·다른 API 누락 가능).
캐리오버 / 휴무 보정
홀드로 빠진 날이 “휴무 보상”과 같은지 별도 정책을 정하고, closure_reselection_required / 캐리오버 필드와 충돌하지 않게 처리 순서를 문서화합니다.
결제·total_delivery_days
홀드 중 요금을 줄일지, 기간만 늘리지 금액은 유지할지에 따라 createOrUpdateSubscription / 결제 완료 후 플로우를 조정합니다.


#Phase 4 — Server Actions & API
requestSubscriptionHold(subscriptionId, durationKind)
검증 → subscription_holds insert → 필요 시 delivery_days/선택 정리(A안).
cancelSubscriptionHold(holdId) (취소 가능 기한이 있으면 여기서 검증)

Cron/Edge function(선택)

end_date 지난 홀드를 expired로 바꾸기(또는 상태 없이 조회만으로 처리).
revalidatePath
/subscription, /delivery, /, /menu, 관리자 리포트 등 기존 패턴에 맞춰 무효화.


##Phase 5 — UI (구독자)
구독 상세(또는 배달 설정)에 “홀드 신청”
라디오/셀렉트: 1·2·3주 / 1~12개월(또는 드롭다운).
시작일 안내(Phase 0 앵커 반영).
확인 모달에 실제 적용 기간 [start, end) 표시.
활성/예정 홀드 목록 + 취소(정책 허용 시)


##Phase 6 — UI (운영·관리자, 필요 시)
관리자에서 홀드 내역 조회(지원·분쟁 대비)
강제 취소/조정(선택) — 권한·감사 로그 고려


##Phase 7 — 테스트 서버 검증 체크리스트
단위: 기간 계산(윤달, 월말, KST 자정 경계), 겹침 검증.
통합: 홀드 전후 delivery_days / 메뉴 선택 / 홈 카운트 / 벤더 리포트 숫자 일치.
회귀: 결제 완료·플랜 변경·캐리오버·매장 휴무 시나리오와 조합 2~3개.

##Phase 8 — 롤아웃
Feature flag 또는 환경 변수로 스테이징만 켜기 → 내부 QA → 프로덕션.

---

## Salad 코드베이스 구현 매핑 (Phase 1–7)

**Phase 1** — `supabase/migrations/034_subscription_holds.sql`, `subscriptions.hold_billing_extension_days`, 타입 `src/types/index.ts`.

**Phase 2** — `src/lib/subscription-hold.ts` (기간·앵커·시프트·옵션 목록), `src/lib/actions/subscription-hold.ts` (신청/기간 변경/취소, `bulkSaveDeliveryDays` 연동).

**Phase 3** — 연동 규칙  
- 공통 판정: `isDeliveryDateInOpenHold`, `hasOpenSubscriptionHold`, `userHasActiveHoldCoveringDeliveryDate` (`src/lib/subscription-hold.ts`, `src/lib/subscription-hold-guard.ts`).  
- 배달 저장: `bulkSaveDeliveryDays` / `saveDeliveryDays`에서 오픈 홀드가 있으면 배달일 변경 차단 (`src/lib/actions/delivery.ts`).  
- 메뉴: `updateMenuQuantity`에서 홀드 구간 날짜면 변경 차단 (`src/lib/actions/menu.ts`).  
- 홈/구독 현황/벤더: 배달일 **시프트(A안에 가깝게)** 로 이미 반영되므로 기존 `delivery_days` 조회 경로와 일치; 홀드 구간 메뉴는 위 가드로 이중 방지.  
- 결제 마감 표시: `effectivePayDeadlineKstDate` + 구독 화면 `PeriodInfoCard` (`subscription-view.tsx`).  
- 캐리오버/휴무와의 순서: 홀드 신청 시 기존 `cleanupStaleSelectionsForSubscription` 유지; 추가 정책은 PM 합의 후 확장.

**Phase 4** — `requestSubscriptionHold` / `cancelSubscriptionHold` / `updateSubscriptionHoldDuration` (구독 ID 기준 취소), `revalidatePath`에 `/admin/subscription-holds` 포함.  
- 만료: `expirePastSubscriptionHoldsForAdmin()` — `end_date`(반개구간 종료일) ≤ KST 오늘 인 행을 `completed` 처리 (`src/lib/actions/subscription-hold-admin.ts`). Cron은 미연결(관리자 버튼 또는 추후 스케줄러 연결).

**Phase 5** — 구독 현황 카드: 홀드 길이 선택, **확인 모달**에 `[start, end)` 안내, 진행 중 홀드 표시·변경·취소 (`subscription-view.tsx`).

**Phase 6** — `/admin/subscription-holds` (권한 `subscription_status`), 목록 + 만료 일괄 버튼 (`subscription-holds-client.tsx`).

**Phase 7** — 수동 QA 시 아래를 스테이징에서 확인 (자동 테스트 스위트는 미추가).  
- [ ] `subscription-hold.ts`: 월말·윤달 월(`months_*`), KST `todayKstIso` 경계에서 `computeHoldExclusiveEnd` / 시프트 역시프트 일관성.  
- [ ] 홀드 전후 `delivery_days`·메뉴 저장 거절·홈 다음 배송일.  
- [ ] `expirePastSubscriptionHoldsForAdmin` 후 상태·구독 화면.  
- [ ] 결제 완료·캐리오버·휴무 보상일 조합 1–2건.