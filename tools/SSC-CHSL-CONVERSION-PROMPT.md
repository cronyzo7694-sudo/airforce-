# 🤖 AI PROMPT — SSC CHSL Questions → JSON Conversion
**(Ye poora prompt apne AI ko copy-paste kar do. Har file/batch ke saath same prompt use karo.)**

---

## PROMPT START — yahan se copy karo

Tum ek expert data-conversion assistant ho. Mere paas **SSC CHSL (Tier-I)** ke previous-year questions hain (Maths, English, Reasoning, GS — 4 files). Tumhe inhe ek **JSON file** me convert karna hai jo mere exam-practice app ke EXACT format me ho. **Ek bhi question miss nahi hona chahiye, koi mismatch nahi hona chahiye.**

### 📁 OUTPUT FILES (4 alag files banani hain)
1. `bank-mathematics.json` — sab Maths/Quantitative Aptitude questions
2. `bank-english.json` — sab English questions
3. `bank-reasoning.json` — sab Reasoning/GI questions
4. `bank-gs.json` — sab GK/GS/General Awareness questions

### 📋 EXACT JSON FORMAT (har file ek JSON ARRAY hai)
```json
[
  {
    "id": "q_sscchsl_math_00001",
    "subject": "mathematics",
    "subjectName": "Quantitative Aptitude",
    "chapter": "Profit & Loss",
    "topic": "Successive Discount",
    "difficulty": "medium",
    "questionText": "A shopkeeper marks an article 40% above cost and gives a 25% discount. His profit % is:",
    "questionTextHi": "एक दुकानदार वस्तु पर क्रय मूल्य से 40% अधिक अंकित करता है और 25% छूट देता है। उसका लाभ % है:",
    "image": null,
    "options": [
      { "id": "A", "text": "15%" },
      { "id": "B", "text": "10%" },
      { "id": "C", "text": "5%" },
      { "id": "D", "text": "12%" }
    ],
    "correctAnswer": "C",
    "explanation": "CP 100 → MP 140 → SP = 140 × 0.75 = 105. Profit = 5%.",
    "explanationHi": "CP 100 → MP 140 → SP = 140 × 0.75 = 105। लाभ = 5%।",
    "source": "SSC CHSL 2022 Tier-I",
    "year": "2022",
    "tags": ["ssc-chsl"],
    "figureBased": false,
    "paper": "Tier-I"
  }
]
```

### 🏷️ SUBJECT VALUES (STRICT — yahi 4 allowed)
| File | `"subject"` | `"subjectName"` |
|---|---|---|
| bank-mathematics.json | `mathematics` | `Quantitative Aptitude` |
| bank-english.json | `english` | `English Language` |
| bank-reasoning.json | `reasoning` | `General Intelligence & Reasoning` |
| bank-gs.json | `gs` | `General Awareness` |

### ⚠️ HARD RULES (inhe todna = kaam reject)
1. **ZERO MISS:** Input file me jitne questions hain, output me UTNE hi. Last me count batao: "Input: X questions → Output: Y questions" — X aur Y EQUAL hone chahiye.
2. **ZERO MISMATCH:** `correctAnswer` SIRF `"A"`, `"B"`, `"C"` ya `"D"` — aur jo option us letter par hai WAHI sahi jawab hona chahiye. Answer key galat letter par ho to options ka order waise adjust karo ki original sahi option hi us letter par rahe — question ka math badalna MAT.
3. **4 options har question me** — kam ya zyada nahi. Options me `id` hamesha `"A"`, `"B"`, `"C"`, `"D"` order me.
4. **Hindi translation (`questionTextHi`, `explanationHi`)** har question me ZAROORI hai — shuddh Hindi, technical terms (जैसे GDP, HCF) English me hi chhod sakte ho. Agar original sirf Hindi me hai to `questionText` me English translation do.
5. **`explanation`** har question me chahiye — 1-3 line ka solution/reason.
6. **`id` unique** ho: `q_sscchsl_<subject>_<5-digit number>` (00001 se badhte hue). Do questions me same id KABHI nahi.
7. **`chapter`/`topic`** meaningful ho — chapter bada topic (e.g. "Profit & Loss"), topic specific (e.g. "Successive Discount"). Kabhi "General" ya blank mat likho.
8. **`difficulty`**: `"easy"` / `"medium"` / `"hard"` — approx 30% easy, 50% medium, 20% hard.
9. **`source`/`year`:** Agar question PYQ hai to "SSC CHSL <year> Tier-I" likho. Pata nahi to "SSC CHSL PYQ-style" likho. **Koi doosra exam ka naam (Air Force/Navy/Army) KABHI mat likhna.**
10. **`image: null`** hamesha (figure-based questions ko SKIP karo — alag list me de dena).
11. **`figureBased: false`** hamesha.
12. **Duplicates:** Agar same question do baar milta hai (same text + same options), sirf EK baar rakho aur last me batao "Removed N duplicates".
13. **Math questions me values/units EXACT** waise hi rakho jo input me hain — number rounding/apne aap se change MAT karo.
14. **Output sirf valid JSON** — koi comment, trailing comma, ya markdown ``` nahi. File directly `.json` ke naam se save hogi.
15. **Numbers/text me LaTeX ya special markup mat use karo** — plain text (₹, °, √, ² jaise Unicode allowed hain).
16. Har 500 questions ke baad file ka hissa (part) bana sakte ho: `bank-mathematics-part1.json`, `part2.json`… main jod dunga.

### ✅ SELF-CHECK (output dene se PEHLE tum khud verify karo)
- [ ] Har question me 19 keys hain (id, subject, subjectName, chapter, topic, difficulty, questionText, questionTextHi, image, options, correctAnswer, explanation, explanationHi, source, year, tags, figureBased, paper) — 18 + sahi options array
- [ ] Input count == Output count (+ removed duplicates listed)
- [ ] correctAnswer sirf A/B/C/D hai aur logically sahi option ko point karta hai (sample 20 questions solve karke check karo)
- [ ] Har questionTextHi aur explanationHi bhari hai
- [ ] Saare ids unique hain
- [ ] JSON.parse() bina error chalta hai

### 📤 OUTPUT FORMAT
Har subject ka output ek **pure JSON array** ke roop me do (code block me ya file me). End me ye summary table do:
| File | Input Q | Output Q | Duplicates removed | Skipped (figure-based) |
|---|---|---|---|---|

---

## PROMPT END — yahan tak copy karo

---

## 📤 Upload Instructions (tumhare liye)
1. AI se 4 files banwao (ya parts) → sab validate ho gayi to:
2. Files ko is naam se save karo: `bank-mathematics.json`, `bank-english.json`, `bank-reasoning.json`, `bank-gs.json`
3. GitHub repo `airforce-` me folder `data/ssc-chsl/` me upload karo (abhi wahan 48 demo questions hain — unki jagah/merge ho jayengi)
4. Mujhe bata do — main live check + import + tests kar dunga

### 🔍 Main check kya karoonga jab files milengi
- JSON valid + schema match
- Question count + unique ids + duplicates
- correctAnswer sanity (random sample solve karke)
- Hindi fields complete
- App me auto-import (fingerprint change → delta import) + naye tests auto-build
- Airforce data se ZERO overlap (dupeHash exam-scoped hai — pakka alag)
