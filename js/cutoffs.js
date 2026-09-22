/* ============================================================
 * AGNIVEER VAYU — REAL EXAM DATA (verified)
 *
 * Sources:
 *  · agnipathvayu.cdac.in (CASB official) — PFT standards,
 *    normalisation scheme, state-wise shortlisting
 *  · Official notification Intake 01/2026 (exam 22 Mar 2025) —
 *    pattern, marking, phase structure
 *  · Category cutoff ranges: 2025-cycle analyst consensus
 *    (Testbook / Physics Wallah / Embibe — expected ranges)
 *
 * NOTE (honesty): IAF official state-wise cutoff NUMBERS publish
 * nahi karta — sirf normalised marks par state-wise shortlist karta
 * hai. Isliye category-wise expected RANGE diya hai, clearly labeled.
 * ============================================================ */

const Cutoffs = (() => {
  /* latest verified exam cycle (airforce) */
  const CYCLE = 'Agniveervayu Intake 01/2026 (exam March 2025)';

  /* v1.4.46 — per-exam cutoff data. % of max marks (normalised).
     · airforce 2025-cycle consensus: UR 70-80 · OBC/EWS 65-75 · SC/ST 60-70
     · SSC CHSL Tier-I 2024 final cutoffs (200 marks): UR 158.4 (≈79%),
       OBC 152.3 (≈76%), EWS 152.5 (≈76%), SC 138.5 (≈69%), ST 129.9 (≈65%)
       — range me thoda buffer: */
  const EXAM_CUTOFFS = {
    airforce: {
      cycle: CYCLE,
      ranges: { GEN: [70, 80], EWS: [65, 75], OBC: [65, 75], SC: [60, 70], ST: [60, 70] }
    },
    'ssc-chsl': {
      cycle: 'SSC CHSL Tier-I 2024 (final official cutoffs ka consensus)',
      ranges: { GEN: [76, 81], EWS: [73, 78], OBC: [73, 78], SC: [66, 71], ST: [62, 67] }
    }
  };
  const RANGES = {
    GEN: [70, 80],
    EWS: [65, 75],
    OBC: [65, 75],
    SC:  [60, 70],
    ST:  [60, 70]
  };
  const CATEGORY_LABELS = {
    GEN: 'General (UR)', EWS: 'EWS', OBC: 'OBC', SC: 'SC', ST: 'ST'
  };

  /* Official paper structure (dono group) */
  const PAPERS = {
    science: { subjects: 'Physics + Maths + English', questions: 70, minutes: 60, maxMarks: 70 },
    other:   { subjects: 'English + RAGA',            questions: 50, minutes: 45, maxMarks: 50 },
    both:    { subjects: 'Physics + Maths + English + RAGA', questions: 100, minutes: 85, maxMarks: 100 }
  };

  /* Domicile states/UTs (IAF state-wise merit inhi domicile se banti hai) */
  const STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
    'Himachal Pradesh', 'Jammu & Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Madhya Pradesh', 'Maharashtra',
    'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman & Nicobar', 'Chandigarh',
    'Dadra & Nagar Haveli and Daman & Diu', 'Lakshadweep', 'Other'
  ];

  /* Phase-2 Physical Fitness Test — OFFICIAL (agnipathvayu.cdac.in/AV/pft) */
  const PFT = {
    run: { male: '1.6 km run — within 07:00', female: '1.6 km run — within 08:00' },
    male: [
      ['10 Push-ups', '01 minute'],
      ['10 Sit-ups', '01 minute'],
      ['20 Squats', '01 minute']
    ],
    female: [
      ['10 Sit-ups', '01 min 30 sec'],
      ['15 Squats', '01 minute']
    ],
    note: 'PFT-I (run) ke baad 10 min recuperation, phir PFT-II exercises — har ke baad 2 min break.'
  };

  /* Medical standards (official notification) */
  const MEDICAL = {
    height: 'Minimum 152.5 cm',
    chest: 'Minimum 5 cm expansion',
    vision: 'As per IAF prescribed standards'
  };

  const MARKING = '+1 correct · −0.25 wrong · 0 unattempted';

  /* ── pure evaluation (unit-testable) ──
     score/maxScore ko category range se compare karta hai.
     Returns {lo, hi, status, marginPct, label}
       status: 'safe' (≥ hi) | 'borderline' (lo..hi) | 'below' (< lo) */
  function evaluate(score, maxScore, category, exam) {
    /* v1.4.46: exam-specific cutoffs — SSC CHSL ka cutoff airforce se alag */
    const XR = (exam && EXAM_CUTOFFS[exam]) ? EXAM_CUTOFFS[exam].ranges : null;
    const SRC = XR || RANGES;
    const r = SRC[category] || SRC.GEN;
    const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
    const lo = r[0], hi = r[1];
    let status, label;
    if (pct >= hi) { status = 'safe'; label = 'SAFE ZONE — cutoff range se upar ✓'; }
    else if (pct >= lo) { status = 'borderline'; label = 'BORDERLINE — safe banne ke liye ' + Math.ceil(hi - pct) + '% aur chahiye'; }
    else { status = 'below'; label = 'BELOW cutoff range — ' + Math.ceil(lo - pct) + '% gap hai'; }
    return {
      category: category, label: label, status: status,
      lo: lo, hi: hi,
      loMarks: Math.round(r[0] * maxScore / 100 * 100) / 100,
      hiMarks: Math.round(r[1] * maxScore / 100 * 100) / 100,
      pct: Math.round(pct * 10) / 10,
      marginPct: Math.round((pct - (status === 'below' ? lo : hi)) * 10) / 10
    };
  }

  return { CYCLE, RANGES, EXAM_CUTOFFS, CATEGORY_LABELS, PAPERS, STATES, PFT, MEDICAL, MARKING, evaluate };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Cutoffs;
