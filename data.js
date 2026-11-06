// 현대카드 American Express Gold Card Edition2 혜택 데이터 (v2)
// 출처: 현대카드 Edition2 공개 보도자료(2024.2), 파이낸셜뉴스, 카드 비교 사이트 정리.
// 현대카드 공식 상품설명서(2024년 기준)와 다를 수 있으니 verify: true 항목은 현대카드 앱에서 확인 후 수정하세요.
//
// 필드 설명
//   period:      monthly(매월) / yearly(연간) / always(상시, 횟수 제한 없음)
//   limitCount:  기간 내 사용 가능 횟수
//   value:       1회 사용 시 아낀 금액 기본값 (사용 기록 화면에 미리 채워짐)
//   icon:        화면에 보이는 아이콘
//   pointPer1000: (적립 혜택) 1,000원당 적립 MR. 값이 있으면 "MR 적립" 영역에 표시
//   pointCap:    (적립 혜택) 월 적립 한도 MR
//   merchants:   결제 가맹점 이름에 이 단어가 들어가면 해당 영역으로 분류 ("@해외" = 외화 결제)
//   minSpend:    전월 실적 조건 (원)

window.SEED_DATA = {
  version: 2,
  items: [
    {
      id: "hd-amex-gold2",
      type: "card",
      name: "아멕스 골드 Edition2",
      issuer: "현대카드",
      color: "#c9a54a",
      annualFee: 300000,
      feeMonth: null, // 연회비 청구 월 (관리 탭에서 설정)
      tiers: [{ min: 500000, label: "특별적립 3배" }],
      note: "",
      verify: false,
    },
  ],

  benefits: [
    // ---- 연간 바우처 ----
    { id: "g-voucher-travel", itemId: "hd-amex-gold2", icon: "🧳", name: "트래블 바우처", desc: "20만원권 1매 · 연간",
      period: "yearly", limitCount: 1, value: 200000, minSpend: null, verify: true },
    { id: "g-voucher-beauty", itemId: "hd-amex-gold2", icon: "💄", name: "패션/뷰티 바우처", desc: "5만원권 1매 · 연간",
      period: "yearly", limitCount: 1, value: 50000, minSpend: null, verify: true },

    // ---- 여행 ----
    { id: "g-lounge", itemId: "hd-amex-gold2", icon: "🛋️", name: "공항 라운지", desc: "전 세계 라운지 · 본인 일 1회 · THE LOUNGE 앱",
      period: "yearly", limitCount: 10, value: null, minSpend: null, merchants: ["라운지", "LOUNGE"], verify: true },
    { id: "g-limo", itemId: "hd-amex-gold2", icon: "🚆", name: "공항 리무진·철도", desc: "리무진/철도 티켓",
      period: "yearly", limitCount: 12, value: null, minSpend: null, verify: true },
    { id: "g-valet", itemId: "hd-amex-gold2", icon: "🚗", name: "공항 발레파킹", desc: "인천공항 등 · 월 통합",
      period: "monthly", limitCount: 5, value: null, minSpend: null, verify: true },
    { id: "g-hotel", itemId: "hd-amex-gold2", icon: "🏨", name: "아멕스 호텔 컬렉션", desc: "객실 업그레이드 + US$100 호텔 크레딧 · 호텔 컬렉션 홈페이지 예약",
      period: "always", limitCount: null, value: null, minSpend: null, verify: true },

    // ---- MR 적립 (예상 적립 계산용) ----
    { id: "g-mr-base", itemId: "hd-amex-gold2", icon: "✨", name: "기본 적립", desc: "국내외 1,000원당 1MR · 한도 없음",
      period: "always", pointPer1000: 1, pointCap: null, merchants: [], minSpend: null, verify: false },
    { id: "g-mr-overseas", itemId: "hd-amex-gold2", icon: "🌏", name: "해외 가맹점", desc: "3배 · 월 4,500MR",
      period: "always", pointPer1000: 3, pointCap: 4500, minSpend: 500000, merchants: ["@해외"], verify: true },
    { id: "g-mr-hotel", itemId: "hd-amex-gold2", icon: "🏨", name: "호텔", desc: "3배 · 월 4,500MR",
      period: "always", pointPer1000: 3, pointCap: 4500, minSpend: 500000,
      merchants: ["호텔", "HOTEL", "RESORT", "리조트", "MARRIOTT", "메리어트", "HILTON", "힐튼", "HYATT", "하얏트", "신라스테이", "조선", "롯데호텔", "IHG", "ACCOR"], verify: true },
    { id: "g-mr-travel", itemId: "hd-amex-gold2", icon: "✈️", name: "항공·여행사", desc: "3배 · 월 4,500MR",
      period: "always", pointPer1000: 3, pointCap: 4500, minSpend: 500000,
      merchants: ["항공", "AIR", "대한항공", "아시아나", "진에어", "제주항공", "티웨이", "에어부산", "여행", "투어", "TOUR", "TRIP", "AGODA", "아고다", "BOOKING", "EXPEDIA", "익스피디아", "야놀자", "여기어때"], verify: true },
    { id: "g-mr-dutyfree", itemId: "hd-amex-gold2", icon: "🛍️", name: "면세점", desc: "3배 · 월 4,500MR",
      period: "always", pointPer1000: 3, pointCap: 4500, minSpend: 500000, merchants: ["면세", "DUTY", "DFS"], verify: true },
    { id: "g-mr-golf", itemId: "hd-amex-gold2", icon: "⛳", name: "골프", desc: "3배 · 월 4,500MR",
      period: "always", pointPer1000: 3, pointCap: 4500, minSpend: 500000, merchants: ["골프", "GOLF", "컨트리클럽", "CLUB"], verify: true },
  ],

  logs: [],
  transactions: [],
  spend: {},
  dismissed: {},
  settings: { applePayItemId: "hd-amex-gold2" },
};
