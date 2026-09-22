#!/usr/bin/env python3
# ═══ SSC CHSL TEMPORARY FULL BANK (v1.4.47) ═══
# Temporary programmatically-generated questions (user: abhi 20-20 naye per subject
# = 32/subject, 128 total; generator full-scale capable). TEMP hai — user ki final 20k files aane par
# bank-meta.json (_bundleKind: 'final') ke saath upload hongi aur ye sab
# demo-temp tagged / q_sscchsl_* ids wale questions AUTO-PURGE ho jayenge.
# Regenerate: python3 tools/make-ssc-temp-bank.py
import json, random, datetime
random.seed(20260922)
ROOT = '/home/user/agniveer-cbt/data/ssc-chsl'

import re as _re

def opt4(correct, wrongs):
    '''Collision-safe: duplicate/equal distractors auto-replace ho jaate hain
    (pehle number ko ±k karke same-format variants).'''
    correct = str(correct)
    clean = []
    for w in wrongs:
        w = str(w)
        if w != correct and w not in clean:
            clean.append(w)
    m = _re.search(r'-?\d+(?:\.\d+)?', correct)
    k = 1
    while len(clean) < 3:
        cand = None
        if m:
            num = float(m.group())
            for delta in (k, -k, k * 7, -k * 7, k * 3):
                try:
                    repl = str(round(num + delta, 2))
                    if '.' in repl and repl.endswith('.0'):
                        repl = repl[:-2]
                    cand = correct[:m.start()] + repl + correct[m.end():]
                except Exception:
                    cand = None
                if cand and cand != correct and cand not in clean:
                    break
                cand = None
        if not cand:
            cand = f'None of these' if 'None of these' not in clean else f'Cannot be determined'
            if cand in clean:
                cand = f'Data inadequate'
        if cand in clean or cand == correct:
            cand = f'Option {k}'
        clean.append(cand)
        k += 1
    items = [correct] + clean
    order = [0, 1, 2, 3]
    random.shuffle(order)
    slots = [None] * 4
    for src, slot in enumerate(order):
        slots[slot] = items[src]
    ans = 'ABCD'[slots.index(correct)]
    return [{'id': L, 'text': str(t)} for L, t in zip('ABCD', slots)], ans

def mk(subject, sid, subjectName, chapter, topic, diff, en, hi, correct, wrongs, exp, exphi):
    options, ans = opt4(correct, wrongs)
    return {
        'id': f'q_sscchsl_{subject}_{sid:04d}',
        'subject': subject, 'subjectName': subjectName,
        'chapter': chapter, 'topic': topic, 'difficulty': diff,
        'questionText': en, 'questionTextHi': hi, 'image': None,
        'options': options, 'correctAnswer': ans,
        'explanation': exp, 'explanationHi': exphi,
        'source': 'SSC CHSL Tier-I practice set (temporary)', 'year': '2024',
        'tags': ['ssc-chsl', 'demo-temp'], 'figureBased': False, 'paper': 'Tier-I'
    }

def rnd(low, high, step=1):
    return random.randrange(low, high + 1, step)

# ══════════════ MATHS (488 naya + 12 purana = 500) ══════════════
def gen_math():
    out = []
    # 1) percentage (55)
    for _ in range(55):
        p = rnd(5, 45, 5); n = rnd(120, 980, 10)
        a = p * n // 100
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Percentage', 'Direct', 'easy',
            f'{p}% of {n} is:', f'{n} का {p}% कितना है?',
            a, [a + rnd(8, 30), a - rnd(8, 30), a + rnd(35, 60)],
            f'{p}% of {n} = {p}/100 × {n} = {a}', f'{n} का {p}% = {p}/100 × {n} = {a}'))
    # 2) ratio share (40)
    for _ in range(40):
        x, y, z = rnd(1, 5), rnd(1, 5), rnd(1, 5)
        total = (x + y + z) * rnd(40, 120, 10)
        unit = total // (x + y + z)
        share = y * unit
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Ratio & Proportion', 'Sharing', 'easy',
            f'Rs {total:,} is divided among A, B, C in the ratio {x} : {y} : {z}. B gets:',
            f'Rs {total:,} को A, B, C में {x} : {y} : {z} में बाँटा गया। B को मिले:',
            f'Rs {share}', [f'Rs {x * unit}', f'Rs {z * unit}', f'Rs {share + unit}'],
            f'Total parts = {x+y+z}; one part = {total}/{x+y+z} = {unit}; B = {y} × {unit} = Rs {share}',
            f'कुल भाग = {x+y+z}; एक भाग = {unit}; B = {y} × {unit} = Rs {share}'))
    # 3) average consecutive (35)
    for _ in range(35):
        start = rnd(2, 40, 2); cnt = rnd(5, 9, 2)
        nums = list(range(start, start + cnt * 2, 2))
        avg = sum(nums) // len(nums)
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Average', 'Consecutive', 'easy',
            f'The average of {cnt} consecutive even numbers starting from {start} is:',
            f'{start} से शुरू होने वाली {cnt} क्रमागत सम संख्याओं का औसत है:',
            avg, [avg + 2, avg - 2, avg + 4],
            f'Average of an AP = (first + last)/2 = ({start} + {nums[-1]})/2 = {avg}',
            f'समांतर श्रेणी का औसत = (पहली + अंतिम)/2 = ({start} + {nums[-1]})/2 = {avg}'))
    # 4) profit & discount (45)
    for _ in range(45):
        cp = rnd(50, 400, 10); up = rnd(20, 60, 5); disc = rnd(10, 40, 5)
        mp = cp + cp * up // 100
        sp = mp - mp * disc // 100
        profit = sp - cp
        pct = round(profit / cp * 100, 1)
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Profit & Loss', 'Successive Discount', 'medium',
            f'A shopkeeper marks an article {up}% above cost (CP Rs {cp}) and allows a {disc}% discount. His profit/loss % is:',
            f'एक दुकानदार वस्तु (क्रय मूल्य Rs {cp}) पर {up}% अधिक अंकित करके {disc}% छूट देता है। लाभ/हानि % है:',
            f'{pct}%', [f'{pct + 4.5}%', f'{pct - 3.5}%', f'{round(up - disc, 1)}%'],
            f'MP = {mp}; SP = {mp} × {100-disc}/100 = {sp}; profit = Rs {profit} → {pct}%',
            f'अंकित मूल्य = {mp}; वि.मू. = {sp}; लाभ = Rs {profit} → {pct}%'))
    # 5) simple interest (40)
    for _ in range(40):
        p = rnd(2, 20, 1) * 500; r = rnd(4, 18, 2); t = rnd(1, 5) * 3
        si = p * r * t // 100
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Simple Interest', 'Basics', 'easy',
            f'Simple interest on Rs {p:,} at {r}% p.a. for {t} years is:',
            f'Rs {p:,} पर {r}% वार्षिक दर से {t} वर्ष का साधारण ब्याज है:',
            f'Rs {si:,}', [f'Rs {si + p // 10:,}', f'Rs {si // 2:,}', f'Rs {si + r * 100:,}'],
            f'SI = PRT/100 = {p} × {r} × {t}/100 = Rs {si}',
            f'SI = PRT/100 = {p} × {r} × {t}/100 = Rs {si}'))
    # 6) time & work (45)
    for _ in range(45):
        a = rnd(6, 24, 2); b = rnd(6, 30, 3)
        t = round(a * b / (a + b), 2)
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Time & Work', 'Efficiency', 'medium',
            f'A finishes a work in {a} days and B in {b} days. Together they finish it in:',
            f'A किसी कार्य को {a} दिन में और B, {b} दिन में पूरा करता है। दोनों मिलकर उसे पूरा करेंगे:',
            f'{t} days', [f'{round((a + b) / 2, 2)} days', f'{round(t * 1.25, 2)} days', f'{round(a + b, 2)} days'],
            f'LCM {a * b if a * b % (a + b) == 0 else a * b} units; rates 1/{a} + 1/{b} = {a + b}/{a * b} → {a * b}/{a + b} = {t} days',
            f'दरें 1/{a} + 1/{b} = {a + b}/{a * b} → समय = {a * b}/{a + b} = {t} दिन'))
    # 7) train speed (35)
    for _ in range(35):
        ln = rnd(12, 40, 2) * 10; sec = rnd(6, 24, 2)
        ms = ln / sec; kmh = ms * 18 / 5
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Speed Time Distance', 'Trains', 'medium',
            f'A train {ln} m long crosses a pole in {sec} seconds. Its speed is:',
            f'{ln} मीटर लंबी रेलगाड़ी एक खंभे को {sec} सेकंड में पार करती है। उसकी गति है:',
            f'{round(kmh, 1)} km/h', [f'{round(kmh * 1.2, 1)} km/h', f'{round(ms, 1)} km/h', f'{round(kmh - 9, 1)} km/h'],
            f'Speed = {ln}/{sec} = {round(ms, 1)} m/s = {round(ms, 1)} × 18/5 = {round(kmh, 1)} km/h',
            f'गति = {ln}/{sec} = {round(ms, 1)} मी/से × 18/5 = {round(kmh, 1)} किमी/घंटा'))
    # 8) x + 1/x (35)
    for _ in range(35):
        k = rnd(3, 15)
        a = k * k - 2
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Algebra', 'Identities', 'medium',
            f'If x + 1/x = {k}, then x² + 1/x² = ?',
            f'यदि x + 1/x = {k}, तो x² + 1/x² = ?',
            a, [k * k + 2, k * k - 1, k * k],
            f'(x + 1/x)² = x² + 1/x² + 2 → {k * k} = x² + 1/x² + 2 → {a}',
            f'({k})² = x² + 1/x² + 2 → x² + 1/x² = {a}'))
    # 9) triangle ratio (35)
    for _ in range(35):
        x, y, z = rnd(1, 6), rnd(1, 6), rnd(1, 6)
        unit = 180 // (x + y + z)
        if unit * (x + y + z) != 180:
            continue
        small = x * unit
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Geometry', 'Triangles', 'easy',
            f'The angles of a triangle are in the ratio {x} : {y} : {z}. The smallest angle is:',
            f'त्रिभुज के कोण {x} : {y} : {z} में हैं। सबसे छोटा कोण है:',
            f'{small}°', [f'{y * unit}°', f'{z * unit}°', f'{small + unit}°'],
            f'{x + y + z} parts = 180° → 1 part = {unit}°; smallest = {x} × {unit} = {small}°',
            f'{x + y + z} भाग = 180° → 1 भाग = {unit}°; सबसे छोटा = {small}°'))
    # 10) square from rect (32)
    for _ in range(32):
        l = rnd(20, 60, 2); b = rnd(15, l - 2, 1)
        per = 2 * (l + b); side = per // 4
        if per % 4:
            continue
        area = side * side
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Mensuration', '2D', 'easy',
            f'A square field has the same perimeter as a rectangle {l} m × {b} m. The area of the square is:',
            f'एक वर्गाकार मैदान का परिमाप {l} मी × {b} मी आयत के परिमाप के बराबर है। वर्ग का क्षेत्रफल है:',
            f'{area} m²', [f'{l * b} m²', f'{area + side} m²', f'{side * (side + 2)} m²'],
            f'Perimeter = {per} m → side = {per}/4 = {side} m → area = {side}² = {area} m²',
            f'परिमाप = {per} मी → भुजा = {side} मी → क्षेत्रफल = {area} मी²'))
    # 11) successive population change (35)
    for _ in range(35):
        up = rnd(5, 25, 5); dn = rnd(5, 20, 5)
        net = round(up - dn - up * dn / 100, 2)
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Percentage', 'Successive Change', 'medium',
            f'A population rises {up}% and then falls {dn}%. The net change is:',
            f'जनसंख्या {up}% बढ़ती है और फिर {dn}% घटती है। शुद्ध परिवर्तन है:',
            f'{net}% decrease', [f'{up - dn}% increase', f'{round(net - 0.5, 2)}% decrease', f'{up - dn}% decrease'],
            f'100 → {100 + up} → {round((100 + up) * (100 - dn) / 100, 2)} → net = {net}% (decrease)',
            f'100 → {100 + up} → {round((100 + up) * (100 - dn) / 100, 2)} → शुद्ध = {net}% कमी'))
    # 12) HCF-LCM (30)
    for _ in range(30):
        h = rnd(4, 12, 2); l1 = rnd(3, 12); l2 = rnd(3, 12)
        lc = h * l1 * l2
        n1 = h * l1
        if lc % n1:
            continue
        other = lc // n1
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Number System', 'HCF & LCM', 'easy',
            f'The HCF and LCM of two numbers are {h} and {lc}. If one number is {n1}, the other is:',
            f'दो संख्याओं का म.स. {h} और ल.स. {lc} है। एक संख्या {n1} है, दूसरी है:',
            other, [other + h, other - h, other * 2],
            f'Product = HCF × LCM = {h * lc}; other = {h * lc}/{n1} = {other}',
            f'गुणनफल = म.स. × ल.स. = {h * lc}; दूसरी = {other}'))
    # 13) compound interest 2yr (28)
    for _ in range(28):
        p = rnd(4, 40, 2) * 500; r = rnd(5, 20, 5)
        ci = round(p * (1 + r / 100) ** 2 - p, 2)
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Compound Interest', '2 Years', 'medium',
            f'Compound interest on Rs {p:,} at {r}% p.a. for 2 years is:',
            f'Rs {p:,} पर {r}% वार्षिक दर से 2 वर्ष का चक्रवृद्धि ब्याज है:',
            f'Rs {round(ci, 2):,}', [f'Rs {round(p * r * 2 / 100, 2):,}', f'Rs {round(ci * 1.1, 2):,}', f'Rs {round(ci / 1.05, 2):,}'],
            f'CI = P[(1 + r/100)² − 1] = {p} × {round((1 + r/100) ** 2 - 1, 4)} = Rs {round(ci, 2)}',
            f'CI = P[(1 + r/100)² − 1] = Rs {round(ci, 2)}'))
    # 14) age problem (30)
    for _ in range(30):
        ratio_now = rnd(2, 5); son = rnd(6, 18, 2)
        father = son * ratio_now
        yrs = rnd(4, 12, 2)
        f2, s2 = father + yrs, son + yrs
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Algebra', 'Ages', 'medium',
            f'A father is {ratio_now} times as old as his son who is {son}. After {yrs} years, the ratio of their ages will be:',
            f'पिता अपने {son} वर्षीय पुत्र से {ratio_now} गुना बड़ा है। {yrs} वर्ष बाद उनकी आयु का अनुपात होगा:',
            f'{f2 // __import__("math").gcd(f2, s2)} : {s2 // __import__("math").gcd(f2, s2)}',
            [f'{round((father + yrs) / (son + yrs), 1)} : 1', f'{ratio_now} : 1', f'{f2 - s2} : {s2}'],
            f'Father {father} → {f2}; son {son} → {s2}; ratio = {f2}:{s2}',
            f'पिता {father} → {f2}; पुत्र {son} → {s2}; अनुपात = {f2}:{s2}'))
    # 15) number series next (30)
    for _ in range(30):
        a = rnd(2, 12); d = rnd(3, 11)
        s = [a]
        for i in range(4): s.append(s[-1] + d * (i + 1))
        nxt = s[-1] + d * 5
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Number System', 'Series', 'easy',
            f'Find the next term: {", ".join(map(str, s))}, ?',
            f'अगला पद ज्ञात करें: {", ".join(map(str, s))}, ?',
            nxt, [nxt + d, nxt - d, nxt + 2 * d],
            f'Differences grow by {d} each step → next = {nxt}',
            f'अंतर हर कदम {d} बढ़ता है → अगला = {nxt}'))
    # 16) squares/mensuration circle (23)
    for _ in range(28):
        r = rnd(7, 35, 7)
        area = round(22 / 7 * r * r, 2)
        out.append(mk('mathematics', 0, 'Quantitative Aptitude', 'Mensuration', 'Circle', 'easy',
            f'The area of a circle of radius {r} cm is (π = 22/7):',
            f'{r} सेमी त्रिज्या वाले वृत्त का क्षेत्रफल है (π = 22/7):',
            f'{area} cm²', [f'{round(2 * 22 / 7 * r, 2)} cm²', f'{round(area * 1.1, 2)} cm²', f'{round(area / 2, 2)} cm²'],
            f'Area = πr² = 22/7 × {r}² = {area} cm²',
            f'क्षेत्रफल = πr² = 22/7 × {r}² = {area} सेमी²'))
    return out

# ══════════════ REASONING (388 naya + 12 = 400) ══════════════
ANALOGY = [
    ('Doctor : Hospital', 'Teacher : School', 'Student : Book', 'Player : Ground', 'Author : Pen'),
    ('Book : Author', 'Painting : Painter', 'Wall : Brick', 'Milk : Cow', 'Table : Wood'),
    ('Bird : Nest', 'Bee : Hive', 'Dog : Kennel', 'Fish : Aquarium', 'Cat : Tree'),
    ('Painter : Brush', 'Writer : Pen', 'Farmer : Plough', 'Doctor : Stethoscope', 'Chef : Knife'),
    ('Thermometer : Temperature', 'Barometer : Pressure', 'Clock : Time', 'Scale : Length', 'Balance : Weight'),
    ('Ophthalmologist : Eye', 'Cardiologist : Heart', 'Neurologist : Brain', 'Dentist : Teeth', 'ENT : Ear'),
    ('Water : Ocean', 'Sand : Desert', 'Tree : Forest', 'Star : Galaxy', 'Fish : River'),
    ('Hunger : Food', 'Thirst : Water', 'Tired : Rest', 'Illness : Medicine', 'Cold : Blanket'),
    ('Petal : Flower', 'Branch : Tree', 'Tyre : Car', 'Chapter : Book', 'Room : House'),
    ('Sculptor : Statue', 'Poet : Poem', 'Composer : Song', 'Architect : Building', 'Tailor : Suit'),
]
ODD_CATS = [
    ('Rose', ['Mango', 'Apple', 'Banana'], 'Rose is a flower; the rest are fruits.', 'गुलाब फूल है; बाकी फल हैं।', 'rose'),
    ('Yamuna', ['Everest', 'K2', 'Kanchenjunga'], 'Yamuna is a river; the rest are mountains.', 'यमुना नदी है; बाकी पर्वत हैं।', 'river'),
    ('Tiger', ['Eagle', 'Sparrow', 'Crow'], 'Tiger is not a bird; the rest are birds.', 'बाघ पक्षी नहीं है; बाकी पक्षी हैं।', 'animal'),
    ('Copper', ['Gold', 'Silver', 'Bronze'], 'Bronze is an alloy; copper, gold, silver are pure metals — copper is odd among alloy options.', 'कांसा मिश्रधातु है; बाकी शुद्ध धातुएँ हैं।', 'metal'),
    ('Kerala', ['Bihar', 'Punjab', 'Gujarat'], 'Kerala is a southern state; the rest are northern states.', 'केरल दक्षिणी राज्य है; बाकी उत्तरी राज्य हैं।', 'state'),
    ('Cricket', ['Chess', 'Carrom', 'Ludo'], 'Cricket is an outdoor game; the rest are indoor games.', 'क्रिकेट बाहरी खेल है; बाकी घर के खेल हैं।', 'game'),
    ('Sun', ['Moon', 'Mars', 'Venus'], 'Sun is a star; the rest are planets/satellite.', 'सूर्य तारा है; बाकी ग्रह/उपग्रह हैं।', 'star'),
    ('Ganga', ['Nile', 'Amazon', 'Sahara'], 'Sahara is a desert; the rest are rivers.', 'सहारा मरुस्थल है; बाकी नदियाँ हैं।', 'desert'),
    ('Potato', ['Wheat', 'Rice', 'Maize'], 'Potato is a vegetable/tuber; the rest are cereals.', 'आलू कंद है; बाकी अनाज हैं।', 'crop'),
    ('Ear', ['Eye', 'Nose', 'Tongue'], 'Ear relates to hearing; the rest to vision/smell/taste — all are sense organs, ear is odd in function pairings.', 'कान सुनने का अंग है; बाकी देखने/सूँघने/चखने के।', 'organ'),
]
BLOOD = [
    ("Pointing to a man, Sita said, 'He is the son of my mother's only son.' How is the man related to Sita?", 'वह सीता से कैसे संबंधित है?', 'Nephew', ['Brother', 'Son', 'Cousin'], "Sita's mother's only son = Sita's brother; his son = Sita's nephew."),
    ("A is B's sister. C is B's mother. D is C's father. How is A related to D?", 'A, D से कैसे संबंधित है?', 'Granddaughter', ['Daughter', 'Grandson', 'Niece'], 'D is A\'s mother\'s father → A is D\'s granddaughter.'),
    ("X's father is the only child of Y. How is Y related to X?", 'Y, X से कैसे संबंधित है?', 'Grandparent (Grandfather/Grandmother)', ['Uncle', 'Brother', 'Father'], 'Y is X\'s father\'s parent.'),
    ("Introducing a boy, a girl said, 'He is the son of the daughter of my grandfather.' How is the boy related to the girl?", 'वह लड़का लड़की से कैसे संबंधित है?', 'Brother or Cousin — here Brother', ['Nephew', 'Uncle', 'Son'], "Grandfather's daughter = girl's mother; her son = girl's brother."),
    ("P is Q's brother, R is Q's mother, S is R's father. How is P related to S?", 'P, S से कैसे संबंधित है?', 'Grandson', ['Son', 'Grandfather', 'Nephew'], 'S → R → Q/P: P is S\'s grandson.'),
]
SYLL = [
    ('All cats are animals. Some animals are dogs. Conclusions: I. Some cats are dogs. II. Some dogs are animals.', 'कथन: सभी बिल्लियाँ जानवर हैं। कुछ जानवर कुत्ते हैं।', 'Only II follows', ['Only I follows', 'Both follow', 'Neither follows'], 'II is the direct converse; I is not certain.'),
    ('All pens are pencils. All pencils are erasers. Conclusion: All pens are erasers.', 'सभी कलम पेंसिल हैं। सभी पेंसिल रबर हैं।', 'Follows (valid chain)', ['Does not follow', 'Only partially follows', 'Cannot say'], 'All→All→All chain is valid.'),
    ('Some books are magazines. No magazine is a newspaper. Conclusion: Some books are not newspapers.', 'कुछ किताबें पत्रिकाएँ हैं। कोई पत्रिका अखबार नहीं है।', 'Follows', ['Does not follow', 'Only sometimes', 'Data insufficient'], 'Those books that are magazines cannot be newspapers.'),
    ('All squares are rectangles. Some rectangles are circles. Conclusion: Some squares are circles.', 'सभी वर्ग आयत हैं। कुछ आयत वृत्त हैं।', 'Does not follow', ['Follows', 'May follow', 'Both'], 'The circles may overlap only non-square rectangles.'),
]
CODING_PAIRS = [
    ('CAT', 'DBU', 'each letter +1', 'DOG'), ('SUN', 'TVO', 'each letter +1', 'MOON'),
    ('BOOK', 'CPPL', 'each letter +1', 'PEN'), ('LAMP', 'MBNQ', 'each letter +1', 'FAN'),
    ('FISH', 'GJTI', 'each letter +1', 'GOAT'), ('TREE', 'USFF', 'each letter +1', 'LEAF'),
]

def gen_reasoning():
    out = []
    # 1) number series (80)
    for _ in range(40):
        a = rnd(2, 15); d = rnd(2, 9)
        s = [a + i * d for i in range(5)]
        out.append(mk('reasoning', 0, 'General Intelligence & Reasoning', 'Series', 'Number Series', 'easy',
            f'Find the next term: {", ".join(map(str, s))}, ?',
            f'अगला पद: {", ".join(map(str, s))}, ?',
            s[-1] + d, [s[-1] + d + 1, s[-1] + 2 * d, s[-1] + d - 2],
            f'Common difference = {d} → next = {s[-1]} + {d} = {s[-1] + d}',
            f'समान अंतर = {d} → अगला = {s[-1] + d}'))
    for _ in range(40):
        a = rnd(2, 6); r = rnd(2, 3)
        s = [a]
        for _ in range(4): s.append(s[-1] * r)
        out.append(mk('reasoning', 0, 'General Intelligence & Reasoning', 'Series', 'Geometric', 'medium',
            f'Find the next term: {", ".join(map(str, s))}, ?',
            f'अगला पद: {", ".join(map(str, s))}, ?',
            s[-1] * r, [s[-1] * r + r, s[-1] + s[-2], s[-1] * (r + 1)],
            f'Each term × {r} → next = {s[-1] * r}',
            f'हर पद × {r} → अगला = {s[-1] * r}'))
    # 2) letter series (45)
    for i in range(45):
        start = rnd(0, 15); step = rnd(1, 4)
        s = [chr(65 + (start + j * step) % 26) for j in range(4)]
        nxt = chr(65 + (start + 4 * step) % 26)
        out.append(mk('reasoning', 0, 'General Intelligence & Reasoning', 'Series', 'Letter Series', 'medium',
            f'Find the next letter: {", ".join(s)}, ?',
            f'अगला अक्षर: {", ".join(s)}, ?',
            nxt, [chr(65 + (start + 4 * step + 1) % 26), chr(65 + (start + 4 * step - 1) % 26), chr(65 + (start + 4 * step + step) % 26)],
            f'Each letter jumps +{step} → next is {nxt}',
            f'हर अक्षर +{step} आगे → अगला {nxt}'))
    # 3) coding (60)
    for word, code, rule, _alt in CODING_PAIRS * 10:
        shifted = ''.join(chr(65 + (ord(c) - 65 + 1) % 26) for c in word)
        out.append(mk('reasoning', 0, 'General Intelligence & Reasoning', 'Coding-Decoding', 'Letter Shift', 'easy',
            f'If {word} is coded as {shifted}, which letter follows the same rule for {word} shifted +2?',
            f'यदि {word} को {shifted} लिखा जाता है (+1 shift), तो {word} का +2 shift कोड होगा:',
            ''.join(chr(65 + (ord(c) - 65 + 2) % 26) for c in word),
            [''.join(chr(65 + (ord(c) - 65 + 3) % 26) for c in word), ''.join(chr(65 + (ord(c) - 65) % 26) for c in word), ''.join(chr(65 + (ord(c) - 65 + 1) % 26) for c in word)],
            f'Rule: every letter moves +1 → +2 shift gives the answer',
            f'नियम: हर अक्षर +1 → +2 shift पर उत्तर मिलता है'))
    # 4) analogy (50)
    for stem, correct, w1, w2, w3 in ANALOGY * 5:
        out.append(mk('reasoning', 0, 'General Intelligence & Reasoning', 'Analogy', 'Word Analogy', 'easy',
            f'{stem} :: ?', f'{stem} :: ?', correct, [w1, w2, w3],
            f'{stem.split(":")[0]} is related to {stem.split(":")[1].strip()} the same way as the correct pair',
            'वही संबंध सही विकल्प में है'))
    # 5) odd one out (50)
    for correct, wrongs, exp_en, exp_hi, _ in ODD_CATS * 5:
        out.append(mk('reasoning', 0, 'General Intelligence & Reasoning', 'Odd One Out', 'Classification', 'easy',
            'Choose the odd one out:', 'असंगत को चुनें:', correct, wrongs, exp_en, exp_hi))
    # 6) direction (40)
    for _ in range(40):
        n = rnd(2, 9); e = rnd(2, 9)
        out.append(mk('reasoning', 0, 'General Intelligence & Reasoning', 'Direction Sense', 'Movements', 'medium',
            f'A man walks {n} km north, then turns right and walks {e} km, then turns right and walks {n} km. How far is he from the start?',
            f'एक व्यक्ति {n} किमी उत्तर, दाएँ मुड़कर {e} किमी, फिर दाएँ मुड़कर {n} किमी चलता है। वह शुरुआत से कितनी दूर है?',
            f'{e} km', [f'{n} km', f'{n + e} km', f'{abs(n - e)} km'],
            f'Net: {n} N + {n} S cancel; displacement = {e} km east',
            f'शुद्ध: {n} उ + {n} द मिट; विस्थापन = {e} किमी पूर्व'))
    # 7) calendar (40)
    for _ in range(40):
        base = datetime.date(2024, 1, 1)
        d = base + datetime.timedelta(days=rnd(0, 400))
        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        day_hi = ['सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार', 'रविवार']
        di = d.weekday()
        out.append(mk('reasoning', 0, 'General Intelligence & Reasoning', 'Calendar', 'Day Calculation', 'hard',
            f'1 January 2024 was a Monday. What day was {d.strftime("%d %B %Y")}?',
            f'1 जनवरी 2024 सोमवार था। {d.strftime("%d %B %Y")} को कौन-सा दिन था?',
            days[di], [days[(di + 1) % 7], days[(di + 2) % 7], days[(di - 1) % 7]],
            f'{d.strftime("%d %m %Y")} is a {days[di]} (day-count from 1 Jan 2024 = {(d - base).days})',
            f'{d.strftime("%d %m %Y")} को {day_hi[di]} था'))
    # 8) blood relations (25)
    for en, hi, correct, wrongs, exp in BLOOD * 5:
        out.append(mk('reasoning', 0, 'General Intelligence & Reasoning', 'Blood Relations', 'Family Tree', 'medium',
            en, hi, correct, wrongs, exp, exp))
    # 9) syllogism (25)
    for en, hi, correct, wrongs, exp in SYLL * 6:
        out.append(mk('reasoning', 0, 'General Intelligence & Reasoning', 'Syllogism', 'Conclusions', 'medium',
            en, hi, correct, wrongs, exp, exp))
    # 10) ranking (33)
    for _ in range(33):
        total = rnd(15, 60); fromleft = rnd(4, total - 4)
        out.append(mk('reasoning', 0, 'General Intelligence & Reasoning', 'Ranking', 'Position', 'easy',
            f'In a row of {total} students, a student is {fromleft}th from the left. What is his position from the right?',
            f'{total} छात्रों की पंक्ति में एक छात्र बाएँ से {fromleft}वाँ है। दाएँ से उसकी स्थिति क्या है?',
            f'{total - fromleft + 1}th', [f'{total - fromleft}th', f'{total - fromleft + 2}th', f'{fromleft}th'],
            f'From right = {total} − {fromleft} + 1 = {total - fromleft + 1}',
            f'दाएँ से = {total} − {fromleft} + 1 = {total - fromleft + 1}'))
    return out

print('templates ready — english/gs generators next')

# ══════════════ ENGLISH (388 naya + 12 = 400) ══════════════
SYN = [
 ('Abundant','Plentiful',['Scarce','Meagre','Rare']), ('Brave','Valiant',['Cowardly','Timid','Weak']),
 ('Candid','Frank',['Deceitful','Secretive','Shy']), ('Diligent','Hardworking',['Lazy','Careless','Idle']),
 ('Eloquent','Fluent',['Inarticulate','Dull','Silent']), ('Frugal','Thrifty',['Wasteful','Extravagant','Lavish']),
 ('Genuine','Authentic',['Fake','Counterfeit','False']), ('Hostile','Unfriendly',['Friendly','Warm','Kind']),
 ('Immaculate','Spotless',['Dirty','Stained','Messy']), ('Keen','Eager',['Indifferent','Apathetic','Dull']),
 ('Lucid','Clear',['Confusing','Vague','Obscure']), ('Meticulous','Careful',['Careless','Sloppy','Hasty']),
 ('Naive','Innocent',['Cunning','Shrewd','Wise']), ('Obsolete','Outdated',['Modern','Current','New']),
 ('Placid','Calm',['Turbulent','Agitated','Stormy']), ('Quaint','Charming',['Modern','Plain','Ugly']),
 ('Robust','Strong',['Fragile','Weak','Delicate']), ('Scenic','Picturesque',['Ugly','Dull','Plain']),
 ('Tenacious','Persistent',['Yielding','Weak','Fickle']), ('Utmost','Greatest',['Least','Minimal','Lowest']),
 ('Vivid','Bright',['Dull','Faded','Pale']), ('Wary','Cautious',['Careless','Reckless','Bold']),
 ('Zealous','Enthusiastic',['Apathetic','Lazy','Cold']), ('Adverse','Unfavourable',['Favourable','Lucky','Good']),
 ('Baffle','Confuse',['Clarify','Explain','Help']), ('Curb','Control',['Release','Free','Loose']),
 ('Defer','Postpone',['Hasten','Rush','Advance']), ('Emit','Release',['Absorb','Take in','Consume']),
 ('Fallacy','Misconception',['Truth','Fact','Reality']), ('Gaudy','Showy',['Sober','Simple','Plain']),
 ('Hamper','Hinder',['Assist','Help','Promote']), ('Illicit','Illegal',['Lawful','Legal','Permitted']),
 ('Jovial','Merry',['Gloomy','Sad','Serious']), ('Lethal','Deadly',['Harmless','Safe','Healing']),
 ('Meagre','Scanty',['Ample','Plentiful','Rich']), ('Novice','Beginner',['Expert','Master','Veteran']),
 ('Oblige','Compel',['Release','Free','Excuse']), ('Peril','Danger',['Safety','Security','Comfort']),
 ('Quiver','Tremble',['Steady','Still','Firm']), ('Rubble','Debris',['Order','Neatness','Structure']),
 ('Sagacious','Wise',['Foolish','Stupid','Naive']), ('Thrifty','Economical',['Wasteful','Spendthrift','Lavish']),
 ('Umbrage','Offence',['Pleasure','Delight','Joy']), ('Vehement','Passionate',['Calm','Mild','Gentle']),
 ('Whet','Sharpen',['Dull','Blunt','Soften']), ('Zenith','Peak',['Nadir','Bottom','Base']),
 ('Ample','Sufficient',['Insufficient','Scanty','Meagre']), ('Bolster','Support',['Undermine','Weaken','Oppose']),
 ('Chide','Scold',['Praise','Applaud','Compliment']), ('Dearth','Scarcity',['Abundance','Plenty','Surplus']),
 ('Endorse','Approve',['Reject','Oppose','Deny']), ('Feign','Pretend',['Reveal','Expose','Admit']),
 ('Gruesome','Horrible',['Pleasant','Lovely','Delightful']), ('Haphazard','Random',['Orderly','Systematic','Planned']),
 ('Inevitable','Unavoidable',['Avoidable','Optional','Preventable']), ('Juxtapose','Compare',['Separate','Divide','Detach']),
 ('Lament','Mourn',['Celebrate','Rejoice','Cheer']), ('Mitigate','Reduce',['Aggravate','Increase','Worsen']),
 ('Nostalgia','Longing',['Indifference','Apathy','Dislike']), ('Ostracise','Exclude',['Include','Welcome','Accept']),
 ('Plagiarise','Copy',['Create','Original','Invent']), ('Quash','Cancel',['Confirm','Establish','Uphold']),
 ('Rebuke','Reprimand',['Praise','Reward','Commend']), ('Solace','Comfort',['Distress','Sorrow','Torment']),
 ('Turbulent','Stormy',['Calm','Peaceful','Serene']), ('Volatile','Unstable',['Stable','Steady','Fixed']),
 ('Wistful','Yearning',['Content','Satisfied','Indifferent']), ('Abate','Decrease',['Increase','Rise','Grow']),
 ('Benevolent','Kind',['Malevolent','Cruel','Harsh']), ('Callous','Unfeeling',['Sensitive','Kind','Gentle']),
 ('Dejected','Sad',['Elated','Happy','Cheerful']), ('Elucidate','Explain',['Confuse','Obscure','Muddle']),
 ('Frivolous','Trivial',['Serious','Important','Weighty']), ('Grievous','Serious',['Minor','Trivial','Petty']),
 ('Impede','Obstruct',['Facilitate','Assist','Aid']), ('Linger','Stay',['Hasten','Leave','Rush']),
 ('Mundane','Ordinary',['Exciting','Unusual','Extraordinary']), ('Nadir','Lowest point',['Zenith','Peak','Summit']),
 ('Prudent','Wise',['Reckless','Careless','Foolish']), ('Resilient','Tough',['Fragile','Weak','Brittle']),
 ('Strenuous','Demanding',['Easy','Effortless','Light']), ('Trivial','Unimportant',['Significant','Vital','Crucial']),
]
ANT = [
 ('Ancient','Modern',['Old','Antique','Aged']), ('Appear','Disappear',['Show','Emerge','Arrive']),
 ('Artificial','Natural',['Synthetic','Fake','Man-made']), ('Attack','Defend',['Assault','Strike','Charge']),
 ('Bold','Timid',['Brave','Daring','Fearless']), ('Bright','Dull',['Shining','Luminous','Radiant']),
 ('Cautious','Reckless',['Careful','Wary','Prudent']), ('Complex','Simple',['Complicated','Intricate','Involved']),
 ('Conceal','Reveal',['Hide','Cover','Mask']), ('Condemn','Praise',['Criticise','Blame','Denounce']),
 ('Deficit','Surplus',['Shortage','Lack','Loss']), ('Deny','Admit',['Refuse','Reject','Disclaim']),
 ('Dense','Sparse',['Thick','Compact','Crowded']), ('Expand','Contract',['Enlarge','Grow','Extend']),
 ('Explicit','Implicit',['Clear','Direct','Plain']), ('Extravagant','Thrifty',['Lavish','Wasteful','Lavish']),
 ('Feeble','Strong',['Weak','Frail','Faint']), ('Flexible','Rigid',['Elastic','Pliable','Supple']),
 ('Fragile','Sturdy',['Delicate','Brittle','Breakable']), ('Generous','Stingy',['Kind','Liberal','Bountiful']),
 ('Guilty','Innocent',['Culpable','Blameworthy','Convicted']), ('Harsh','Gentle',['Severe','Stern','Rough']),
 ('Humid','Dry',['Damp','Moist','Muggy']), ('Idle','Busy',['Lazy','Inactive','Unemployed']),
 ('Ignorant','Informed',['Unaware','Uninformed','Naive']), ('Import','Export',['Bring in','Introduce','Ship in']),
 ('Include','Exclude',['Contain','Involve','Comprise']), ('Increase','Decrease',['Rise','Grow','Expand']),
 ('Innocent','Guilty',['Blameless','Pure','Naive']), ('Kind','Cruel',['Gentle','Nice','Warm']),
 ('Lenient','Strict',['Merciful','Forgiving','Tolerant']), ('Liberty','Bondage',['Freedom','Independence','Autonomy']),
 ('Mandatory','Optional',['Compulsory','Obligatory','Required']), ('Maximum','Minimum',['Greatest','Highest','Most']),
 ('Noisy','Silent',['Loud','Clamorous','Rowdy']), ('Obey','Disobey',['Follow','Comply','Heed']),
 ('Optional','Compulsory',['Voluntary','Elective','Discretionary']), ('Praise','Criticise',['Applaud','Commend','Extol']),
 ('Private','Public',['Personal','Secret','Individual']), ('Profit','Loss',['Gain','Earnings','Return']),
 ('Reject','Accept',['Refuse','Decline','Repudiate']), ('Rural','Urban',['Country','Village','Pastoral']),
 ('Scatter','Gather',['Spread','Disperse','Strew']), ('Servile','Domineering',['Submissive','Obedient','Slavish']),
 ('Shallow','Deep',['Superficial','Slight','Cursory']), ('Sorrow','Joy',['Grief','Sadness','Misery']),
 ('Stable','Unstable',['Firm','Steady','Secure']), ('Superior','Inferior',['Higher','Greater','Better']),
 ('Transparent','Opaque',['Clear','Lucid','Sheer']), ('Victory','Defeat',['Triumph','Win','Success']),
 ('Wealth','Poverty',['Riches','Affluence','Prosperity']),
 ('Willing','Reluctant',['Ready','Eager','Prepared']), ('Abstract','Concrete',['Theoretical','Vague','Ideal']),
 ('Admire','Despise',['Appreciate','Respect','Adore']), ('Amateur','Professional',['Novice','Beginner','Learner']),
 ('Arrogant','Humble',['Proud','Haughty','Conceited']), ('Barren','Fertile',['Infertile','Sterile','Bleak']),
 ('Benevolent','Malevolent',['Kind','Generous','Charitable']), ('Compress','Expand',['Press','Squeeze','Condense']),
 ('Contract','Expand',['Shrink','Reduce','Decrease']), ('Diverge','Converge',['Deviate','Separate','Branch']),
 ('Egoist','Altruist',['Selfish','Self-centred','Vain']), ('Elevate','Lower',['Raise','Lift','Hoist']),
 ('Famous','Obscure',['Renowned','Noted','Eminent']), ('Fatal','Harmless',['Deadly','Lethal','Mortal']),
 ('Hinder','Help',['Obstruct','Impede','Hamper']), ('Humble','Proud',['Modest','Meek','Unassuming']),
 ('Introvert','Extrovert',['Shy','Reserved','Withdrawn']), ('Lofty','Low',['High','Towering','Elevated']),
 ('Mobile','Stationary',['Movable','Portable','Travelling']), ('Mourn','Rejoice',['Grieve','Lament','Weep']),
 ('Passionate','Apathetic',['Ardent','Fervent','Emotional']), ('Permanent','Temporary',['Lasting','Enduring','Durable']),
 ('Praise-worthy','Blameworthy',['Commendable','Laudable','Creditable']), ('Rigid','Flexible',['Stiff','Firm','Inflexible']),
 ('Scarcity','Abundance',['Shortage','Deficit','Dearth']), ('Temporary','Permanent',['Provisional','Passing','Transitory']),
 ('Vacant','Occupied',['Empty','Unoccupied','Free']), ('Vague','Definite',['Unclear','Obscure','Ambiguous']),
 ('Wax','Wane',['Increase','Grow','Enlarge']), ('Zenith','Nadir',['Peak','Summit','Apex']),
]
IDIOMS = [
 ('To burn the midnight oil','To work late into the night',['To waste resources','To sleep early','To celebrate']),
 ('A blessing in disguise','A hidden benefit',['An obvious curse','A planned gift','A disguised threat']),
 ('To bite the bullet','To endure a painful situation bravely',['To escape danger','To speak rudely','To eat quickly']),
 ('Once in a blue moon','Very rarely',['Very often','Every night','Twice a day']),
 ('To hit the nail on the head','To say exactly the right thing',['To hurt someone','To miss the point','To hammer hard']),
 ('A piece of cake','Something very easy',['A delicious dessert','A small part','A difficult task']),
 ('To let the cat out of the bag','To reveal a secret',['To free an animal','To hide the truth','To create chaos']),
 ('To be on cloud nine','To be extremely happy',['To be confused','To dream','To be ill']),
 ('To burn bridges','To destroy relationships irreversibly',['To build connections','To cross a river','To light a fire']),
 ('To turn a blind eye','To deliberately ignore',['To lose eyesight','To watch carefully','To help someone']),
 ('At the drop of a hat','Instantly, without hesitation',['After much delay','Reluctantly','Occasionally']),
 ('To cost an arm and a leg','To be very expensive',['To be cheap','To be injured','To donate generously']),
 ('To be all ears','To listen eagerly',['To be deaf','To speak a lot','To ignore others']),
 ('To cry over spilt milk','To regret what cannot be undone',['To waste milk','To complain about food','To weep loudly']),
 ('The ball is in your court','It is your turn to act or decide',['The game is over','You have lost','You must leave']),
 ('To add fuel to the fire','To make a situation worse',['To extinguish a fire','To calm things down','To cook food']),
 ('A black sheep','A disgraceful member of a group',['A rare animal','A lucky person','A dark night']),
 ('To keep at bay','To keep something away',['To imprison someone','To hold closely','To sail a ship']),
 ('To smell a rat','To suspect something wrong',['To find a pet','To clean the house','To feel hungry']),
 ('To take to task','To rebuke or scold',['To accept a job','To praise someone','To complete work']),
 ('In hot water','In trouble',['While bathing','In a good mood','While swimming']),
 ('To pull someone\'s leg','To joke or tease playfully',['To injure someone','To help someone walk','To pull a rope']),
 ('By and large','On the whole, generally',['Very slowly','Rarely','In detail']),
 ('To make both ends meet','To live within one\'s income',['To join two ropes','To finish a race','To meet friends']),
 ('A wild goose chase','A futile pursuit',['Hunting birds','A fast race','A fruitful search']),
 ('To be in deep water','To be in serious difficulty',['To swim well','To enjoy boating','To dive deeply']),
 ('To show the white feather','To display cowardice',['To show courage','To surrender arms','To wave a flag']),
 ('A bolt from the blue','A sudden, unexpected shock',['A flash of lightning','A slow change','A planned event']),
 ('To play second fiddle','To take a subordinate role',['To play music','To lead a team','To cheat someone']),
 ('To bell the cat','To take a great risk',['To tie a bell','To catch mice','To avoid danger']),
 ('To fish in troubled waters','To take advantage of others\' difficulty',['To swim in a river','To go fishing','To rescue someone']),
 ('To be hand in glove','To be in close association (often for wrong)',['To wear gloves','To fight openly','To be strangers']),
 ('To read between the lines','To grasp the hidden meaning',['To read fast','To skip lines','To read aloud']),
 ('To rest on one\'s laurels','To be satisfied with past achievements',['To take rest','To retire from work','To exercise daily']),
 ('To steal a march','To gain an advantage secretly',['To walk quietly','To march in a parade','To rob a soldier']),
 ('A man of straw','A weak, worthless person',['A farmer','A wealthy man','A strong leader']),
 ('To be on the fence','To be undecided',['To sit on a wall','To take sides','To build a fence']),
 ('To move heaven and earth','To try one\'s utmost',['To cause a disaster','To travel widely','To pray']),
 ('To be born with a silver spoon','To be born into wealth',['To be fed with a spoon','To be lucky in exams','To be poor']),
 ('To make one\'s mouth water','To feel tempted (about food)',['To be thirsty','To speak rudely','To cry']),
 ('To throw cold water on','To discourage',['To refresh someone','To praise','To extinguish fire']),
 ('To keep the wolf from the door','To avoid starvation or poverty',['To shut the door','To keep pets away','To guard the house']),
 ('To leave no stone unturned','To try every possible means',['To be lazy','To move houses','To collect stones']),
 ('To be under a cloud','To be under suspicion or disgrace',['To get wet in rain','To be famous','To be confused']),
 ('A red-letter day','An important, memorable day',['A holiday of colour','A sad day','An ordinary day']),
 ('To carry coals to Newcastle','To do something unnecessary or redundant',['To work hard','To trade profitably','To travel far']),
 ('To spill the beans','To disclose a secret',['To drop food','To cook beans','To hide the truth']),
 ('To beat about the bush','To talk without coming to the point',['To search a forest','To be direct','To garden']),
 ('To smell a rat', 'To suspect deceit',['To find a rat','To feel a bad odour','To be curious']),
 ('To be up in arms','To protest strongly',['To be ready to fight a war','To exercise','To surrender weapons']),
]
ONEWORD = [
 ('One who loves mankind','Philanthropist',['Misanthrope','Egoist','Anarchist']),
 ('A person who writes life story of another','Biographer',['Autobiographer','Novelist','Historian']),
 ('Government by the people','Democracy',['Monarchy','Autocracy','Oligarchy']),
 ('A place where bees are kept','Apiary',['Aviary','Byre','Kennel']),
 ('One who eats everything','Omnivore',['Carnivore','Herbivore','Frugivore']),
 ('A speech delivered without preparation','Extempore',['Elegy','Soliloquy','Monologue']),
 ('One who can use both hands equally well','Ambidextrous',['Ambivalent','Dexterous','Skilful']),
 ('A person who takes no interest in worldly affairs','Ascetic',['Atheist','Agorist','Sceptic']),
 ('Murder of a king','Regicide',['Genocide','Homicide','Suicide']),
 ('A child whose parents are dead','Orphan',['Widow','Foundling','Heir']),
 ('Study of heavenly bodies','Astronomy',['Astrology','Geology','Meteorology']),
 ('One who abstains from alcohol','Teetotaller',['Vegetarian','Smoker','Addict']),
 ('Fear of water','Hydrophobia',['Claustrophobia','Agoraphobia','Xenophobia']),
 ('One who knows many languages','Polyglot',['Linguist','Grammarian','Bilingual']),
 ('A list of books','Catalogue',['Dictionary','Encyclopaedia','Glossary']),
 ('Occurring every year','Annual',['Biennial','Perennial','Monthly']),
 ('A place where grain is stored','Granary',['Dairy','Granite','Barnyard']),
 ('One who deals in cloth','Draper',['Grocer','Haberdasher','Merchant']),
 ('That which cannot be corrected','Incorrigible',['Illiterate','Incurable','Illegible']),
 ('A remedy for all diseases','Panacea',['Antidote','Antibiotic','Vaccine']),
 ('One who is new to a profession','Novice',['Veteran','Expert','Master']),
 ('A person of good understanding and knowledge','Erudite',['Illiterate','Naive','Vulgar']),
 ('Words written on a tomb','Epitaph',['Epilogue','Epithet','Elegy']),
 ('A person who believes in God','Theist',['Atheist','Agnostic','Sceptic']),
 ('Animals that live in water','Aquatic',['Amphibian','Terrestrial','Aerial']),
 ('One who is present everywhere','Omnipresent',['Omnipotent','Omniscient','Ubiquitous']),
 ('A doctor who treats eyes','Ophthalmologist',['Optician','Optometrist','Oculist']),
 ('A group of sheep','Flock',['Herd','Swarm','Pack']),
 ('That which cannot be avoided','Inevitable',['Invisible','Invincible','Illegible']),
 ('A speech made to oneself','Soliloquy',['Dialogue','Monologue','Sermon']),
 ('One who loves books','Bibliophile',['Philatelist','Numismatist','Archivist']),
 ('A place where birds are kept','Aviary',['Apiary','Menagerie','Cage']),
 ('One who steals ideas or writings','Plagiarist',['Pirate','Thief','Burglar']),
 ('Fear of confined spaces','Claustrophobia',['Hydrophobia','Acrophobia','Xenophobia']),
 ('A woman whose husband is dead','Widow',['Widower','Orphan','Spinster']),
 ('One who travels to holy places','Pilgrim',['Tourist','Nomad','Hermit']),
 ('Killing of one\'s brother','Fratricide',['Patricide','Matricide','Regicide']),
 ('A collection of poems','Anthology',['Biography','Almanac','Directory']),
 ('One who eats vegetables only','Vegetarian',['Carnivore','Omnivore','Frugivore']),
 ('A person appointed to settle a dispute','Arbitrator',['Judge','Lawyer','Mediator']),
]
SPELL = [
 ('Occasion',['Occassion','Ocassion','Occassionn']), ('Accommodation',['Accomodation','Acommodation','Accommodattion']),
 ('Committee',['Commitee','Comittee','Committe']), ('Definitely',['Definately','Definetly','Defenitely']),
 ('Embarrass',['Embarass','Embarras','Embaras']), ('Existence',['Existance','Exsistence','Existanse']),
 ('Foreign',['Foriegn','Forign','Forein']), ('Government',['Goverment','Governmant','Govermant']),
 ('Grievance',['Grevance','Grievence','Greivance']), ('Harass',['Harrass','Haras','Harras']),
 ('Maintenance',['Maintainance','Maintenence','Maintanance']), ('Millennium',['Millenium','Milennium','Millenneum']),
 ('Necessary',['Neccessary','Necesary','Necessery']), ('Occurrence',['Occurence','Occurrance','Ocurrence']),
 ('Privilege',['Priviledge','Privelege','Privillege']), ('Pronunciation',['Pronounciation','Pronunciaton','Pronounciaton']),
 ('Questionnaire',['Questionaire','Questionnair','Questionere']), ('Receive',['Recieve','Receve','Recive']),
 ('Recommend',['Recomend','Reccommend','Reccomend']), ('Rhythm',['Rythm','Rhythem','Rithm']),
 ('Separate',['Seperate','Seperete','Saparate']), ('Successful',['Succesful','Successfull','Sucessful']),
 ('Tomorrow',['Tommorow','Tommorrow','Tomorow']), ('Twelfth',['Twelth','Twelvth','Twelfthh']),
 ('Vacuum',['Vaccum','Vacume','Vaccum']), ('Weird',['Wierd','Weerd','Wiered']),
 ('Achieve',['Acheive','Achive','Achiev']), ('Believe',['Belive','Beleive','Believ']),
 ('Beginning',['Begining','Beginnning','Begginning']), ('Business',['Buisness','Busness','Busy-ness']),
 ('Calendar',['Calender','Calandar','Calendir']), ('Cemetery',['Cemetary','Cematery','Cemetry']),
 ('Conscience',['Concience','Conscence','Consciense']), ('Desperate',['Desparate','Disperate','Despirate']),
 ('Discipline',['Disipline','Dicipline','Disciplin']), ('Environment',['Enviroment','Envirnoment','Enviornment']),
 ('Exaggerate',['Exagerate','Exaggarate','Exeggerate']), ('February',['Febuary','Februry','Febraury']),
 ('Immediate',['Immediat','Imediate','Immediatte']), ('Jewellery',['Jewelery','Jwellery','Jewellry']),
]
ERRT = [
 ('Neither of the two boys (A) were present (B) in the class (C) today. (D)','B','\'Neither\' takes a singular verb — was present.',"'Neither' के साथ singular क्रिया"),
 ('He has been living in Delhi (A) since five years (B) without any (C) complaint. (D)','B','Period of time takes \'for\' — for five years.','अवधि के साथ for'),
 ('One of my friend (A) is going (B) to Mumbai (C) tomorrow. (D)','A','\'One of\' takes a plural noun — one of my friends.','one of के बाद plural'),
 ('The news (A) are very disturbing (B) said the officer (C) to me. (D)','B','\'News\' is singular — the news is.','news singular है'),
 ('She do not know (A) how to solve (B) this problem (C) correctly. (D)','A','Third-person singular takes \'does\'.','third-person singular के साथ does'),
 ('I am working here (A) since 2019 (B) and know everyone (C) well. (D)','B','\'Since 2019\' needs present perfect — have been working.','since के साथ present perfect'),
 ('Each of the players (A) were given (B) a medal (C) by the chief guest. (D)','B','\'Each\' is singular — was given.','each singular है'),
 ('The scenery of Kashmir (A) are breathtaking (B) especially in spring (C) season. (D)','B','\'Scenery\' is uncountable and singular — is.','scenery singular है'),
 ('He is senior than me (A) by two years (B) but respects (C) my experience. (D)','A','Senior/junior take \'to\', not \'than\'.','senior के साथ to'),
 ('My father has gone (A) to Mumbai (B) last week (C) by train. (D)','C','With past time expressions use simple past — went.','last week के साथ simple past'),
]
FILL = [
 ('He has been living in Delhi ____ 2015.','since',['for','from','by']),
 ('She is good ____ mathematics.','at',['in','on','with']),
 ('The cat jumped ____ the table.','onto',['in','at','of']),
 ('I will meet you ____ Monday.','on',['in','at','by']),
 ('He insisted ____ paying the bill.','on',['at','for','with']),
 ('We must abide ____ the rules.','by',['with','to','for']),
 ('She apologised ____ her mistake.','for',['of','about','with']),
 ('He is addicted ____ video games.','to',['with','on','in']),
 ('The book consists ____ ten chapters.','of',['in','with','from']),
 ('They arrived ____ the airport late.','at',['to','in','on']),
 ('He died ____ malaria.','of',['from','by','with']),
 ('I prefer tea ____ coffee.','to',['than','over from','against']),
 ('She is afraid ____ dogs.','of',['from','with','by']),
 ('The minister was accused ____ corruption.','of',['for','with','about']),
 ('He succeeded ____ passing the exam.','in',['at','on','for']),
 ('This book is different ____ that one.','from',['than','to','with']),
 ('We should not boast ____ our wealth.','of',['for','on','in']),
 ('The child is fond ____ sweets.','of',['with','for','about']),
 ('He was charged ____ theft.','with',['of','for','by']),
 ('I congratulated him ____ his success.','on',['for','of','with']),
 ('She is married ____ a doctor.','to',['with','by','of']),
 ('The road is blocked ____ snow.','by',['with','from','of']),
 ('He is superior ____ me in rank.','to',['than','from','over']),
 ('I am looking forward ____ meeting you.','to',['for','at','with']),
 ('The thief was sent ____ prison.','to',['in','at','for']),
 ('He is capable ____ doing better.','of',['for','to','in']),
 ('Water consists ____ hydrogen and oxygen.','of',['in','from','with']),
 ('Do not intrude ____ my privacy.','on',['in','at','to']),
 ('He has a talent ____ music.','for',['of','in','to']),
 ('She complained ____ the noise.','about',['for','of','on']),
]
VOICE = [
 ('They are building a new bridge.','A new bridge is being built.',['A new bridge is built.','A new bridge has been built.','A new bridge was being built.']),
 ('The chef cooked a delicious meal.','A delicious meal was cooked.',['A delicious meal is cooked.','A delicious meal has cooked.','A meal is being cook.']),
 ('Someone has stolen my bicycle.','My bicycle has been stolen.',['My bicycle is stolen.','My bicycle was being stolen.','My bicycle had stolen.']),
 ('She will write a letter.','A letter will be written.',['A letter will be wrote.','A letter is written.','A letter would written.']),
 ('The gardener waters the plants daily.','The plants are watered daily.',['The plants were watered daily.','The plants are watering daily.','The plants have watered daily.']),
 ('Did the boss approve the plan?','Was the plan approved by the boss?',['Is the plan approved by the boss?','Has the plan approved?','Was the plan approve?']),
 ('Open the window.','Let the window be opened.',['The window is opened.','The window was opened.','Let the window opened.']),
 ('People speak English all over the world.','English is spoken all over the world.',['English was spoken all over the world.','English speaks all over the world.','English is speaking all over world.']),
 ('The children have eaten the cake.','The cake has been eaten by the children.',['The cake has eaten by the children.','The cake was eaten by the children.','The cake is eaten by children.']),
 ('Who broke the vase?','By whom was the vase broken?',['Who was broken the vase?','Whom broke the vase?','By whom the vase broke?']),
]
NARR = [
 ("He said, 'I am tired.'","He said that he was tired.",['He said that he is tired.','He said that I am tired.','He says he was tired.']),
 ("She said, 'I will come tomorrow.'","She said that she would come the next day.",['She said she will come tomorrow.','She said she would come tomorrow.','She says she would come.']),
 ("He said, 'I have finished my work.'","He said that he had finished his work.",['He said that he has finished his work.','He said he finished his work.','He says he had finished.']),
 ("The teacher said, 'The earth revolves around the sun.'","The teacher said that the earth revolves around the sun.",['The teacher said the earth revolved around the sun.','The teacher said the earth had revolved.','The teacher says the earth revolve.']),
 ("He said to me, 'Where do you live?'","He asked me where I lived.",['He asked me where did I live.','He asked me where I live.','He said where I lived.']),
 ("She said, 'Do you like coffee?'","She asked whether I liked coffee.",['She asked do I like coffee.','She said whether I liked coffee.','She asked that I liked coffee.']),
 ("He said, 'What a beautiful sight!'","He exclaimed that it was a very beautiful sight.",['He said it is a beautiful sight.','He exclaimed what a sight is.','He told a beautiful sight.']),
 ("Mother said, 'Do not touch the wire.'","Mother told me not to touch the wire.",['Mother said do not touch the wire.','Mother told not to touch the wire.','Mother says don\'t touch wire.']),
 ("He said, 'Alas! I am ruined.'","He exclaimed with sorrow that he was ruined.",['He said alas he is ruined.','He exclaimed with joy he was ruined.','He said that he ruined.']),
 ("The officer said, 'Well done, soldiers!'","The officer applauded the soldiers saying that they had done well.",['The officer said well done soldiers.','The officer exclaimed that soldiers do well.','The officer told soldiers well done.']),
]

def gen_english():
    out = []
    i_syn = 0
    for word, syn, wrongs in SYN:
        out.append(mk('english', 0, 'English Language', 'Synonyms', 'Vocabulary', 'easy',
            f'Choose the word most similar in meaning to: {word.upper()}', f'इस शब्द का समानार्थक चुनें: {word.upper()}',
            syn, wrongs, f'{word} means the same as {syn}.', f'{word} = {syn}'))
    for word, ant, wrongs in ANT:
        out.append(mk('english', 0, 'English Language', 'Antonyms', 'Vocabulary', 'easy',
            f'Choose the word most OPPOSITE in meaning to: {word.upper()}', f'इस शब्द का विलोम चुनें: {word.upper()}',
            ant, wrongs, f'The opposite of {word} is {ant}.', f'{word} का विलोम {ant} है।'))
    for idiom, mean, wrongs in IDIOMS:
        out.append(mk('english', 0, 'English Language', 'Idioms & Phrases', 'Meaning', 'medium',
            f"The idiom '{idiom}' means:", f"मुहावरे '{idiom}' का अर्थ है:", mean, wrongs,
            f"'{idiom}' = {mean}.", f"'{idiom}' = {mean}"))
    for clue, word, wrongs in ONEWORD:
        out.append(mk('english', 0, 'English Language', 'One Word Substitution', 'Words', 'medium',
            f"One word for '{clue}':", f"'{clue}' के लिए एक शब्द:", word, wrongs,
            f'{clue} = {word}.', f'{clue} = {word}'))
    for right, wrongs in SPELL:
        out.append(mk('english', 0, 'English Language', 'Spelling', 'Correct Spelling', 'easy',
            'Choose the correctly spelt word:', 'सही वर्तनी वाला शब्द चुनें:', right, wrongs,
            f'The correct spelling is {right}.', f'सही वर्तनी {right} है।'))
    for sent, part, exp, exphi in ERRT:
        out.append(mk('english', 0, 'English Language', 'Spot the Error', 'Parts', 'medium',
            f'Choose the part with an error: {sent}', f'त्रुटि वाला भाग चुनें: {sent}', part, ['A', 'B', 'C', 'D'],
            exp, exphi))
    for sent, ans, wrongs in FILL:
        out.append(mk('english', 0, 'English Language', 'Fill in the Blanks', 'Prepositions', 'easy',
            f'Fill in the blank: {sent.replace("____", "____")}', f'रिक्त स्थान भरें: {sent.replace("____", "____")}',
            ans, wrongs, f'The correct preposition is "{ans}".', f'सही क्रिया-विशेषण/संबंध "{ans}" है।'))
    for active, passive, wrongs in VOICE:
        out.append(mk('english', 0, 'English Language', 'Active/Passive Voice', 'Transformation', 'medium',
            f"Choose the correct passive form: '{active}'", f"सही passive रूप चुनें: '{active}'",
            passive, wrongs, f'Passive of the given sentence is: {passive}', 'दिए गए वाक्य का passive रूप सही विकल्प है।'))
    for direct, indirect, wrongs in NARR:
        out.append(mk('english', 0, 'English Language', 'Direct/Indirect Speech', 'Transformation', 'medium',
            f"Indirect speech: {direct}", f"Indirect speech: {direct}",
            indirect, wrongs, f'Correct indirect form: {indirect}', 'सही indirect रूप यही है।'))
    return out
print('english banks ready')

# ══════════════ GS (238 naya + 12 = 250) ══════════════
# (chapter, en, hi, correct, [w1,w2,w3])
GSFACTS = [
 ('Indian Polity','The Constitution of India came into effect on:','भारतीय संविधान लागू हुआ:','26 January 1950',['15 August 1947','26 November 1949','2 October 1950']),
 ('Indian Polity','Who is known as the Father of the Indian Constitution?','भारतीय संविधान के जनक कौन हैं?','Dr B. R. Ambedkar',['Mahatma Gandhi','Jawaharlal Nehru','Sardar Patel']),
 ('Indian Polity','The Right to Education is given under which Article?','शिक्षा का अधिकार किस अनुच्छेद में है?','Article 21A',['Article 19','Article 32','Article 44']),
 ('Indian Polity','The Bharat Ratna was instituted in:','भारत रत्न की स्थापना कब हुई?','1954',['1947','1950','1962']),
 ('Indian Polity','How many fundamental duties are there in the Indian Constitution?','भारतीय संविधान में मूल कर्तव्य कितने हैं?','11',['10','12','9']),
 ('Indian Polity','The President of India is elected by:','भारत के राष्ट्रपति का चुनाव करते हैं:','An electoral college',['Lok Sabha alone','Direct public vote','Supreme Court']),
 ('Indian Polity','Money Bills can be introduced only in:','धन विधेयक केवल कहाँ प्रस्तुत किया जा सकता है?','Lok Sabha',['Rajya Sabha','Either House','Joint sitting']),
 ('Indian Polity','The term of a Lok Sabha is normally:','लोकसभा की अवधि सामान्यतः होती है:','5 years',['4 years','6 years','7 years']),
 ('Indian Polity','Who appoints the Chief Justice of India?','भारत के मुख्य न्यायाधीश की नियुक्ति कौन करता है?','The President',['The Prime Minister','Parliament','Supreme Court collegium alone']),
 ('Indian Polity','The Panchayati Raj system was constitutionalised by which amendment?','पंचायती राज को किस संशोधन से संवैधानिक दर्जा मिला?','73rd Amendment',['42nd Amendment','61st Amendment','74th Amendment']),
 ('Indian Polity','Fundamental Rights are borrowed from the Constitution of:','मूल अधिकार किस देश के संविधान से लिए गए हैं?','USA',['UK','Ireland','Canada']),
 ('Indian Polity','The Speaker of the Lok Sabha is elected by:','लोकसभा अध्यक्ष का चुनाव करती है:','Members of Lok Sabha',['The President','The Prime Minister','Both Houses']),
 ('Indian Polity','Which writ is called the protector of Fundamental Rights?','किस रिट को मूल अधिकारों का रक्षक कहा जाता है?','Habeas Corpus',['Mandamus','Certiorari','Quo Warranto']),
 ('Indian Polity','The idea of the Concurrent List is borrowed from:','समवर्ती सूची का विचार कहाँ से लिया गया है?','Australia',['USA','Ireland','UK']),
 ('Indian Polity','The Election Commission of India is established under Article:','भारत का निर्वाचन आयोग किस अनुच्छेद के तहत स्थापित है?','Article 324',['Article 315','Article 338','Article 356']),
 ('Indian Polity','Who is the supreme commander of the Indian armed forces?','भारतीय सेनाओं का सर्वोच्च सेनापति कौन है?','The President',['The Prime Minister','Defence Minister','Chief of Defence Staff']),
 ('Indian Polity','The first Amendment to the Indian Constitution was made in:','भारतीय संविधान में पहला संशोधन कब हुआ?','1951',['1950','1952','1949']),
 ('Indian Polity','How many members can the President nominate to the Rajya Sabha?','राष्ट्रपति राज्यसभा में कितने सदस्य मनोनीत कर सकते हैं?','12',['10','14','2']),
 ('Indian Polity','The Directive Principles of State Policy are in which Part of the Constitution?','राज्य के नीति निदेशक तत्व संविधान के किस भाग में हैं?','Part IV',['Part III','Part V','Part IVA']),
 ('Indian Polity','A person can become President of India at the age of at least:','भारत का राष्ट्रपति बनने की न्यूनतम आयु है:','35 years',['25 years','30 years','40 years']),
 ('History','The Non-Cooperation Movement was launched in:','असहयोग आंदोलन कब शुरू हुआ?','1920',['1919','1922','1930']),
 ('History','The Jallianwala Bagh massacre took place in:','जलियाँवाला बाग हत्याकांड कब हुआ?','1919',['1920','1918','1921']),
 ('History','Who founded the Maurya Empire?','मौर्य साम्राज्य की स्थापना किसने की?','Chandragupta Maurya',['Ashoka','Bindusara','Samudragupta']),
 ('History','The Quit India Movement was launched in:','भारत छोड़ो आंदोलन कब शुरू हुआ?','1942',['1940','1945','1935']),
 ('History','The Battle of Plassey was fought in:','प्लासी का युद्ध कब हुआ?','1757',['1764','1761','1748']),
 ('History','Who built the Taj Mahal?','ताजमहल किसने बनवाया?','Shah Jahan',['Akbar','Aurangzeb','Humayun']),
 ('History','The Indus Valley Civilisation is also known as:','सिंधु घाटी सभ्यता को कहा जाता है:','Harappan Civilisation',['Vedic Civilisation','Dravidian Civilisation','Aryan Civilisation']),
 ('History','Buddha was born in:','बुद्ध का जन्म हुआ था:','Lumbini',['Kapilvastu','Bodh Gaya','Sarnath']),
 ('History','The Dandi March was undertaken in:','दांडी मार्च कब हुआ?','1930',['1928','1932','1934']),
 ('History','Who was the first Mughal emperor?','पहला मुगल सम्राट कौन था?','Babur',['Akbar','Humayun','Timur']),
 ('History','The Indian National Congress was founded in:','भारतीय राष्ट्रीय कांग्रेस की स्थापना कब हुई?','1885',['1875','1905','1890']),
 ('History','Ashoka belonged to which dynasty?','अशोक किस वंश के थे?','Maurya',['Gupta','Chola','Nanda']),
 ('History','The capital of the Gupta Empire was:','गुप्त साम्राज्य की राजधानी थी:','Pataliputra',['Ujjain','Taxila','Mathura']),
 ('History','Vasco da Gama reached India in:','वास्को डी गामा भारत कब पहुँचा?','1498',['1492','1500','1510']),
 ('History','The Revolt of 1857 began from:','1857 की क्रांति कहाँ से शुरू हुई?','Meerut',['Delhi','Kanpur','Lucknow']),
 ('History','Who gave the slogan "Jai Hind"?','"जय हिंद" का नारा किसने दिया?','Subhas Chandra Bose',['Bhagat Singh','Mahatma Gandhi','Nehru']),
 ('History','The Simon Commission came to India in:','साइमन कमीशन भारत कब आया?','1928',['1919','1930','1935']),
 ('History','Gandhi returned to India from South Africa in:','गांधी दक्षिण अफ्रीका से भारत कब लौटे?','1915',['1913','1917','1919']),
 ('History','The Charter Act of 1833 made which Governor-General the first of all India?','1833 का चार्टर एक्ट किसे अखिल भारतीय गवर्नर-जनरल बनाया?','William Bentinck',['Warren Hastings','Dalhousie','Canning']),
 ('History','Ajanta Caves are associated with which religion?','अजंता गुफाएँ किस धर्म से संबंधित हैं?','Buddhism',['Jainism','Hinduism','Sikhism']),
 ('Geography','Which is the longest river in India?','भारत की सबसे लंबी नदी कौन-सी है?','Ganga',['Brahmaputra','Godavari','Yamuna']),
 ('Geography','Punjab is known as the land of:','पंजाब को किसकी भूमि कहा जाता है?','Five rivers',['Six rivers','Four rivers','Seven rivers']),
 ('Geography','The Tropic of Cancer does NOT pass through:','कर्क रेखा किस राज्य से नहीं गुजरती?','Kerala',['Gujarat','Rajasthan','Jharkhand']),
 ('Geography','Which state has the longest coastline in India?','किस राज्य की तटरेखा सबसे लंबी है?','Gujarat',['Tamil Nadu','Andhra Pradesh','Maharashtra']),
 ('Geography','Mount Everest is located in:','माउंट एवरेस्ट स्थित है:','Nepal',['India','Bhutan','China']),
 ('Geography','The Sundarbans delta is formed by:','सुंदरबन डेल्टा किन नदियों से बनता है?','Ganga-Brahmaputra',['Godavari-Krishna','Narmada-Tapi','Mahanadi-Baitarani']),
 ('Geography','Which is the largest state of India by area?','क्षेत्रफल के हिसाब से भारत का सबसे बड़ा राज्य कौन-सा है?','Rajasthan',['Madhya Pradesh','Maharashtra','Uttar Pradesh']),
 ('Geography','The Western Ghats are also called:','पश्चिमी घाट को कहा जाता है:','Sahyadri',['Aravalli','Vindhya','Satpura']),
 ('Geography','Which river is known as the "Sorrow of Bihar"?','किस नदी को "बिहार का शोक" कहा जाता है?','Kosi',['Gandak','Son','Ghaghara']),
 ('Geography','The Deccan Plateau is made mainly of:','डेक्कन पठार मुख्यतः किसका बना है?','Basalt rock',['Granite','Sandstone','Limestone']),
 ('Geography','India\'s southernmost point is:','भारत का सबसे दक्षिणी बिंदु है:','Indira Point',['Kanyakumari','Rameswaram','Kochi']),
 ('Geography','Which is the largest freshwater lake in India?','भारत की सबसे बड़ी मीठे पानी की झील कौन-सी है?','Wular Lake',['Chilika','Sambhar','Dal Lake']),
 ('Geography','The Palk Strait separates India from:','पाक जलडमरूमध्य भारत को किससे अलग करता है?','Sri Lanka',['Maldives','Myanmar','Indonesia']),
 ('Geography','Monsoon winds in India blow from sea to land in:','भारत में मानसून हवाएँ समुद्र से थल की ओर कब चलती हैं?','Summer',['Winter','Autumn','Throughout the year']),
 ('Geography','Which is the highest waterfall in India?','भारत का सबसे ऊँचा जलप्रपात कौन-सा है?','Kunchikal Falls',['Jog Falls','Dudhsagar','Athirappilly']),
 ('Geography','The National Waterway-1 is on which river?','राष्ट्रीय जलमार्ग-1 किस नदी पर है?','Ganga',['Brahmaputra','Godavari','Yamuna']),
 ('Science','The SI unit of electric current is:','विद्युत धारा की SI इकाई है:','Ampere',['Volt','Ohm','Watt']),
 ('Science','Which vitamin is synthesized by sunlight in the human body?','सूर्य प्रकाश से शरीर में कौन-सा विटामिन बनता है?','Vitamin D',['Vitamin A','Vitamin B12','Vitamin C']),
 ('Science','The chemical formula of common salt is:','साधारण नमक का रासायनिक सूत्र है:','NaCl',['Na2CO3','CaCl2','KCl']),
 ('Science','Which gas is most abundant in the Earth\'s atmosphere?','पृथ्वी के वायुमंडल में सबसे प्रचुर गैस कौन-सी है?','Nitrogen',['Oxygen','Carbon dioxide','Argon']),
 ('Science','The powerhouse of the cell is:','कोशिका का ऊर्जा-गृह है:','Mitochondria',['Nucleus','Ribosome','Golgi body']),
 ('Science','Light travels fastest in:','प्रकाश सबसे तेज़ चलता है:','Vacuum',['Water','Glass','Diamond']),
 ('Science','Blood pressure is measured by:','रक्तचाप मापा जाता है:','Sphygmomanometer',['Thermometer','Barometer','Hygrometer']),
 ('Science','Which planet is known as the Red Planet?','किस ग्रह को लाल ग्रह कहा जाता है?','Mars',['Venus','Jupiter','Mercury']),
 ('Science','The unit of force is:','बल की इकाई है:','Newton',['Joule','Pascal','Watt']),
 ('Science','Plants prepare food by the process of:','पौधे भोजन किस प्रक्रिया से बनाते हैं?','Photosynthesis',['Respiration','Transpiration','Osmosis']),
 ('Science','Which metal is liquid at room temperature?','कौन-सी धातु कमरे के ताप पर द्रव रहती है?','Mercury',['Iron','Zinc','Aluminium']),
 ('Science','The largest gland in the human body is:','मानव शरीर की सबसे बड़ी ग्रंथि है:','Liver',['Pancreas','Thyroid','Pituitary']),
 ('Science','Sound cannot travel through:','ध्वनि किसमें यात्रा नहीं कर सकती?','Vacuum',['Air','Water','Steel']),
 ('Science','Rusting of iron is a:','लोहे में जंग लगना एक है:','Chemical change',['Physical change','Reversible change','No change']),
 ('Science','The hardest natural substance is:','सबसे कठोर प्राकृतिक पदार्थ है:','Diamond',['Iron','Quartz','Graphite']),
 ('Science','How many chambers does the human heart have?','मानव हृदय में कितने कक्ष होते हैं?','4',['2','3','6']),
 ('Science','Which instrument measures atmospheric pressure?','वायुदाब मापने का यंत्र है:','Barometer',['Hygrometer','Anemometer','Manometer']),
 ('Science','The study of earthquakes is called:','भूकंप के अध्ययन को कहते हैं:','Seismology',['Geology','Meteorology','Ecology']),
 ('Science','Which acid is present in the human stomach?','मानव पेट में कौन-सा अम्ल होता है?','Hydrochloric acid',['Sulphuric acid','Nitric acid','Acetic acid']),
 ('Science','The pH of pure water is:','शुद्ध जल का pH होता है:','7',['1','10','14']),
 ('Science','Which blood group is called the universal donor?','किस रक्त समूह को सर्वदाता कहा जाता है?','O negative',['AB positive','A positive','B negative']),
 ('Economics','GDP stands for:','GDP का पूर्ण रूप है:','Gross Domestic Product',['General Domestic Price','Gross Direct Payment','Global Development Plan']),
 ('Economics','The Reserve Bank of India was established in:','भारतीय रिज़र्व बैंक की स्थापना कब हुई?','1935',['1947','1949','1930']),
 ('Economics','Which body prepares the Economic Survey of India?','भारत का आर्थिक सर्वेक्षण कौन तैयार करता है?','Ministry of Finance',['RBI','NITI Aayog','Planning Commission']),
 ('Economics','Inflation refers to:','मुद्रास्फीति का अर्थ है:','A sustained rise in prices',['A fall in prices','A rise in income','A fall in taxes']),
 ('Economics','GST was implemented in India in:','भारत में GST कब लागू हुआ?','2017',['2016','2018','2015']),
 ('Economics','The base year of India\'s current GDP series is:','भारत की वर्तमान GDP श्रृंखला का आधार वर्ष है:','2011-12',['2004-05','2015-16','2010-11']),
 ('Economics','Which is the apex bank of India?','भारत का सर्वोच्च बैंक है:','Reserve Bank of India',['State Bank of India','NABARD','SEBI']),
 ('Economics','A budget deficit means:','बजट घाटे का अर्थ है:','Expenditure exceeds revenue',['Revenue exceeds expenditure','Balanced budget','No expenditure']),
 ('Economics','NITI Aayog replaced the:','नीति आयोग ने किसका स्थान लिया?','Planning Commission',['Finance Commission','Election Commission','Law Commission']),
 ('Economics','Which sector is called the tertiary sector?','किस क्षेत्र को तृतीयक क्षेत्र कहा जाता है?','Services',['Agriculture','Manufacturing','Mining']),
 ('Static GK','"Wings of Fire" is the autobiography of:','"विंग्स ऑफ फायर" किसकी आत्मकथा है?','A. P. J. Abdul Kalam',['Mahatma Gandhi','Nelson Mandela','Atal Bihari Vajpayee']),
 ('Static GK','The national sport of Japan is:','जापान का राष्ट्रीय खेल है:','Sumo wrestling',['Judo','Karate','Baseball']),
 ('Static GK','How many players are there in a cricket team on the field?','क्रिकेट टीम में मैदान पर कितने खिलाड़ी होते हैं?','11',['10','12','9']),
 ('Static GK','The currency of Japan is:','जापान की मुद्रा है:','Yen',['Won','Yuan','Ringgit']),
 ('Static GK','Oscar awards are given for excellence in:','ऑस्कर पुरस्कार उत्कृष्टता के लिए दिए जाते हैं:','Films',['Literature','Sports','Science']),
 ('Static GK','The headquarters of UNESCO is in:','यूनेस्को का मुख्यालय है:','Paris',['New York','Geneva','Rome']),
 ('Static GK','Who wrote the play "Macbeth"?','"मैकबेथ" नाटक किसने लिखा?','William Shakespeare',['Charles Dickens','Leo Tolstoy','George Bernard Shaw']),
 ('Static GK','The Red Fort is located in:','लाल किला स्थित है:','Delhi',['Agra','Jaipur','Lucknow']),
 ('Static GK','The first Asian to win a Nobel Prize was:','नोबेल पुरस्कार जीतने वाले पहले एशियाई थे:','Rabindranath Tagore',['C. V. Raman','Mother Teresa','Amartya Sen']),
 ('Static GK','The Olympics are held every:','ओलंपिक होते हैं:','4 years',['2 years','3 years','5 years']),
 ('Static GK','The Indian tricolour was designed by:','भारतीय तिरंगा किसने डिज़ाइन किया?','Pingali Venkayya',['Rabindranath Tagore','Bankim Chandra','Nehru']),
 ('Static GK','Which is the smallest bone in the human body?','मानव शरीर की सबसे छोटी हड्डी है:','Stapes',['Femur','Fibula','Radius']),
 ('Static GK','"Gitanjali" was written by:','"गीतांजलि" किसने लिखी?','Rabindranath Tagore',['Sarojini Naidu','Premchand','Kalidas']),
 ('Static GK','The largest desert in the world is:','विश्व का सबसे बड़ा मरुस्थल है:','Sahara',['Thar','Gobi','Kalahari']),
 ('Static GK','The Great Wall is in:','ग्रेट वॉल स्थित है:','China',['Japan','Korea','Mongolia']),
 ('Static GK','The UN was founded in:','संयुक्त राष्ट्र की स्थापना कब हुई?','1945',['1919','1950','1947']),
 ('Static GK','Which city is called the "Pink City" of India?','किस शहर को भारत का "गुलाबी शहर" कहा जाता है?','Jaipur',['Udaipur','Jodhpur','Ajmer']),
 ('Static GK','Sachin Tendulkar\'s international debut was in:','सचिन तेंदुलकर का अंतरराष्ट्रीय डेब्यू हुआ:','1989',['1987','1991','1990']),
 ('Static GK','The logo of "Make in India" is a:','"मेक इन इंडिया" का लोगो है:','Lion',['Tiger','Elephant','Peacock']),
 ('Static GK','The first talkie film of India was:','भारत की पहली बोलती फिल्म थी:','Alam Ara',['Raja Harishchandra','Mother India','Awara']),
 ('Static GK','Who is called the "Missile Man of India"?','किसे भारत का "मिसाइल मैन" कहा जाता है?','A. P. J. Abdul Kalam',['Homi Bhabha','Vikram Sarabhai','Raja Ramanna']),
 ('Static GK','Which is the national aquatic animal of India?','भारत का राष्ट्रीय जलीय पशु कौन-सा है?','Gangetic dolphin',['Blue whale','Shark','Turtle']),
 ('Static GK','Ajanta Caves are in the state of:','अजंता गुफाएँ किस राज्य में हैं?','Maharashtra',['Madhya Pradesh','Karnataka','Odisha']),
 ('Static GK','The first President of India was:','भारत के प्रथम राष्ट्रपति थे:','Dr Rajendra Prasad',['Jawaharlal Nehru','S. Radhakrishnan','Zakir Husain']),
 ('Static GK','Which sport uses the term "love" for zero?','किस खेल में शून्य के लिए "लव" शब्द प्रयोग होता है?','Tennis',['Cricket','Football','Hockey']),
 ('Static GK','The Bankim Chandra Chattopadhyay wrote:','बंकिम चंद्र चटर्जी ने लिखी:','Vande Mataram',['Jana Gana Mana','Sare Jahan Se Achha','Rang De Basanti']),
 ('Static GK','The Konark Sun Temple is in:','कोणार्क सूर्य मंदिर स्थित है:','Odisha',['Bengal','Bihar','Jharkhand']),
 ('Static GK','Which Mughal emperor built Fatehpur Sikri?','किस मुगल सम्राट ने फतेहपुर सीकरी बनवाई?','Akbar',['Babur','Shah Jahan','Jahangir']),
 ('Static GK','The Indian Railways was nationalised in:','भारतीय रेल का राष्ट्रीयकरण हुआ:','1951',['1947','1955','1960']),
 ('Static GK','Garba is a folk dance of:','गरबा किस राज्य का लोक नृत्य है?','Gujarat',['Rajasthan','Punjab','Maharashtra']),
 ('Static GK','The Currency of the USA is issued by:','अमेरिका की मुद्रा जारी करता है:','Federal Reserve',['US Treasury','Bank of America','Congress']),
 ('Static GK','The Crimean Peninsula lies in:','क्रीमिया प्रायद्वीप स्थित है:','Black Sea region, Europe',['Mediterranean','Baltic','Caspian']),
]

def gen_gs():
    out = []
    for chapter, en, hi, correct, wrongs in GSFACTS:
        out.append(mk('gs', 0, 'General Awareness', chapter, 'Static', 'easy', en, hi, correct, wrongs,
                      f'The correct fact: {correct}.', f'सही तथ्य: {correct}।'))
    return out

# ══════════════ WRITER ══════════════
import os
# USER DIRECTIVE (v1.4.47): 20-20 NAYE temp Q per subject — 12 purane demo + 20 naye = 32/subject.
# (Generator poora chalta hai — baad me full bank chahiye to NEW_PER_SUBJECT badha do.)
NEW_PER_SUBJECT = 20
NEW = {'mathematics': gen_math(), 'reasoning': gen_reasoning(), 'english': gen_english(), 'gs': gen_gs()}

for subject, news in NEW.items():
    # purane v1.4.46 demo (12/subject) ko rakho — same ids/content → live users par dupe-skip
    old = json.load(open(f'{ROOT}/bank-{subject}.json', encoding='utf-8'))[:12]
    for q in old:
        q['tags'] = ['ssc-chsl', 'demo-temp']
    final = []
    for i, q in enumerate(old + news[:NEW_PER_SUBJECT]):
        q['id'] = f'q_sscchsl_{subject}_{i + 1:03d}'   # 3-digit — live DB ids se EXACT match
        final.append(q)
    with open(f'{ROOT}/bank-{subject}.json', 'w', encoding='utf-8') as f:
        json.dump(final, f, ensure_ascii=False, indent=1)
    print(f'bank-{subject}.json: {len(final)} Q (12 old + {len(final) - 12} new)')

meta = {'_bundleKind': 'temp-demo', '_note': 'TEMP demo bank — final 20k files aane par _bundleKind: "final" karne se demo-temp auto-purge hoga'}
for subject in NEW:
    arr = json.load(open(f'{ROOT}/bank-{subject}.json', encoding='utf-8'))
    ch = {}
    for q in arr:
        ch[q['chapter']] = ch.get(q['chapter'], 0) + 1
    meta[subject] = {'total': len(arr), 'keyed': len(arr), 'withExplanation': len(arr), 'chapters': ch}
with open(f'{ROOT}/bank-meta.json', 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)
print('bank-meta.json: _bundleKind = temp-demo')
