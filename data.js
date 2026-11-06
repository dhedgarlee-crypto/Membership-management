// 초기 예시 데이터.
// 카드 혜택은 2026년 기사·카드 비교 사이트(카드고릴라 등)를 참고했으며, 실제 조건과 다를 수 있습니다.
// verify: true 인 항목은 앱에서 "확인 필요"로 표시됩니다. 공식 앱/홈페이지에서 확인 후 수정하세요.

window.SEED_DATA = {
  version: 1,
  items: [
    {
      id: "hd-amex-gold2",
      type: "card",
      name: "아멕스 골드 Edition2",
      issuer: "현대카드",
      color: "#c9a54a",
      annualFee: 0, // 연회비 금액 확인 후 입력
      feeMonth: null, // 연회비 청구 월 (1~12)
      tiers: [{ min: 500000, label: "특별적립" }],
      note: "MR 적립. 연회비·바우처 종류는 현대카드 앱에서 확인",
      verify: true,
    },
    {
      id: "nh-classy-travel",
      type: "card",
      name: "클래시 트래블",
      issuer: "NH농협카드",
      color: "#1f3a5f",
      annualFee: 0,
      feeMonth: null,
      tiers: [{ min: 1000000, label: "해외 4%·라운지" }],
      note: "해외결제 수수료 면제(실적 무관)",
      verify: true,
    },
    {
      id: "ss-id-select-all",
      type: "card",
      name: "iD SELECT ALL",
      issuer: "삼성카드",
      color: "#1c1c1e",
      annualFee: 20000,
      feeMonth: null,
      tiers: [
        { min: 400000, label: "1구간" },
        { min: 800000, label: "2구간" },
        { min: 1200000, label: "3구간" },
      ],
      note: "SELECT 영역은 삼성카드 앱에서 선택한 업종 기준",
      verify: true,
    },
    {
      id: "oliveyoung",
      type: "membership",
      name: "올리브영",
      issuer: "CJ올리브영",
      color: "#9bc31c",
      annualFee: 0,
      feeMonth: null,
      tiers: [],
      note: "등급(베이비~골드)에 따라 쿠폰 다름",
      verify: true,
    },
    {
      id: "cjone",
      type: "membership",
      name: "CJ ONE",
      issuer: "CJ",
      color: "#e8344e",
      annualFee: 0,
      feeMonth: null,
      tiers: [],
      note: "CGV·뚜레쥬르·빕스 등 CJ 계열",
      verify: true,
    },
    {
      id: "lpoint",
      type: "membership",
      name: "롯데 L.POINT",
      issuer: "롯데멤버스",
      color: "#da291c",
      annualFee: 0,
      feeMonth: null,
      tiers: [],
      note: "",
      verify: true,
    },
    {
      id: "tmembership",
      type: "membership",
      name: "T 멤버십",
      issuer: "SK텔레콤",
      color: "#3617ce",
      annualFee: 0,
      feeMonth: null,
      tiers: [],
      note: "등급(VIP/골드/실버)별 혜택 다름",
      verify: true,
    },
  ],

  benefits: [
    // 현대 아멕스 골드 Edition2
    { id: "b-amex-voucher", itemId: "hd-amex-gold2", name: "연간 바우처", desc: "연회비 상쇄용 바우처 (약 25만원 상당)", period: "yearly", limitCount: 1, limitAmount: null, tierLimits: [], minSpend: null, verify: true },
    { id: "b-amex-special", itemId: "hd-amex-gold2", name: "MR 특별적립", desc: "해외·특급호텔·항공·면세점 등 추가 적립", period: "always", limitCount: null, limitAmount: null, tierLimits: [], minSpend: 500000, verify: true },
    { id: "b-amex-base", itemId: "hd-amex-gold2", name: "MR 기본적립", desc: "국내외 1,000원당 1MR", period: "always", limitCount: null, limitAmount: null, tierLimits: [], minSpend: null, verify: false },

    // NH 클래시 트래블
    { id: "b-nh-lounge", itemId: "nh-classy-travel", name: "공항 라운지", desc: "전 세계 공항 라운지 무료", period: "yearly", limitCount: 4, limitAmount: null, tierLimits: [], minSpend: 1000000, verify: true },
    { id: "b-nh-fx", itemId: "nh-classy-travel", name: "해외결제 수수료 면제", desc: "해외 이용 수수료 면제, 전월실적 무관", period: "always", limitCount: null, limitAmount: null, tierLimits: [], minSpend: null, verify: false },
    { id: "b-nh-point", itemId: "nh-classy-travel", name: "포인트 적립", desc: "국내 1.2% · 해외 3% (실적 100만원↑ 해외 4%)", period: "always", limitCount: null, limitAmount: null, tierLimits: [], minSpend: null, verify: true },
    { id: "b-nh-annual", itemId: "nh-classy-travel", name: "연간 이용 보너스", desc: "연간 1,000만원 이용 시 5만 포인트", period: "yearly", limitCount: 1, limitAmount: null, tierLimits: [], minSpend: null, verify: true },

    // 삼성 iD SELECT ALL
    { id: "b-ss-select1", itemId: "ss-id-select-all", name: "SELECT 1 할인", desc: "선택 영역 할인 (구간별 7천/1만/1.5만원 한도)", period: "monthly", limitCount: null, limitAmount: null,
      tierLimits: [{ min: 400000, amount: 7000 }, { min: 800000, amount: 10000 }, { min: 1200000, amount: 15000 }], minSpend: 400000, verify: true },
    { id: "b-ss-select2", itemId: "ss-id-select-all", name: "SELECT 2 할인", desc: "선택 영역 할인 (구간별 7천/1만/1.5만원 한도)", period: "monthly", limitCount: null, limitAmount: null,
      tierLimits: [{ min: 400000, amount: 7000 }, { min: 800000, amount: 10000 }, { min: 1200000, amount: 15000 }], minSpend: 400000, verify: true },
    { id: "b-ss-overseas", itemId: "ss-id-select-all", name: "해외 2% 할인", desc: "전월실적·한도 없음", period: "always", limitCount: null, limitAmount: null, tierLimits: [], minSpend: null, verify: true },
    { id: "b-ss-domestic", itemId: "ss-id-select-all", name: "국내 0.7% 할인", desc: "전월실적·한도 없음", period: "always", limitCount: null, limitAmount: null, tierLimits: [], minSpend: null, verify: true },

    // 올리브영
    { id: "b-oy-coupon", itemId: "oliveyoung", name: "등급 쿠폰", desc: "매월 등급별 할인 쿠폰 발급", period: "monthly", limitCount: 1, limitAmount: null, tierLimits: [], minSpend: null, verify: true },
    { id: "b-oy-sale", itemId: "oliveyoung", name: "올영세일", desc: "분기별 세일 기간 확인", period: "quarterly", limitCount: 1, limitAmount: null, tierLimits: [], minSpend: null, verify: true },

    // CJ ONE
    { id: "b-cj-point", itemId: "cjone", name: "포인트 적립·사용", desc: "CJ 계열사 결제 시 적립", period: "always", limitCount: null, limitAmount: null, tierLimits: [], minSpend: null, verify: false },
    { id: "b-cj-birthday", itemId: "cjone", name: "생일·등급 쿠폰", desc: "CGV·뚜레쥬르 등 쿠폰", period: "yearly", limitCount: 1, limitAmount: null, tierLimits: [], minSpend: null, verify: true },

    // 롯데
    { id: "b-lp-point", itemId: "lpoint", name: "L.POINT 적립·사용", desc: "롯데 계열사 결제 시", period: "always", limitCount: null, limitAmount: null, tierLimits: [], minSpend: null, verify: false },
    { id: "b-lp-coupon", itemId: "lpoint", name: "월간 쿠폰", desc: "앱에서 이번 달 쿠폰 확인", period: "monthly", limitCount: 1, limitAmount: null, tierLimits: [], minSpend: null, verify: true },

    // T 멤버십
    { id: "b-t-day", itemId: "tmembership", name: "T day", desc: "매월 T day 제휴 할인", period: "monthly", limitCount: 1, limitAmount: null, tierLimits: [], minSpend: null, verify: true },
    { id: "b-t-vip", itemId: "tmembership", name: "VIP 혜택 (영화 등)", desc: "등급별 연간 제공 횟수 확인", period: "yearly", limitCount: 3, limitAmount: null, tierLimits: [], minSpend: null, verify: true },
  ],

  logs: [],
  spend: {},
  dismissed: {},
};
