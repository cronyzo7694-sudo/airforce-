#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""English bank repair v1.4.19 — passage-prepend + corruption fixes + removals.
DRY RUN by default: --apply se bank files change hoti hain."""
import json, re, sys, copy

APPLY = '--apply' in sys.argv
ROOT = '/home/user/agniveer-cbt'
MASTER = '/home/user/uploads/Master_English_All_Papers.txt'
M = 0xFFFFFFFF

def hash16(s):
    h1, h2 = 0x811c9dc5, 0x01000193
    for ch in s:
        c = ord(ch)
        h1 ^= c; h1 = (h1 * 16777619) & M
        h2 = (h2 + c * 31) & M
    return (format(h1, 'x') + format(h2, 'x')).rjust(16, '0')[:16]

SEP = '\u241f'
def content_id(q):
    return 'q_' + hash16(SEP.join([q['subject'], q['questionText'],
              ' | '.join(o['text'] for o in q['options']), q['correctAnswer'] or '?']))
def dupe_id(q):
    return hash16(SEP.join([q['subject'], q['questionText'],
              ' | '.join(o['text'] for o in q['options'])]))

# ---------- master parse ----------
papers = {}   # pno -> [qtext...]
cur = None
for line in open(MASTER, encoding='utf-8'):
    line = line.rstrip('\n')
    m = re.match(r'^PAPER (\d+)', line)
    if m:
        cur = int(m.group(1)); papers[cur] = []; continue
    if cur is None: continue
    qm = re.match(r'^Q(\d+)\.\s*(.*)$', line)
    if qm and qm.group(2).strip():
        papers[cur].append(qm.group(2).strip())

def common_prefix(strs):
    if not strs: return ''
    p = strs[0]
    for s in strs[1:]:
        while not s.startswith(p):
            p = p[:-1]
        if not p: break
    return p

def extract_passage(pno, bank_longs, known_questions=()):
    """paper pno ka DIR+passage block. Master longs pehle (OCR-clean), warna bank longs."""
    ml = [l for l in papers.get(pno, []) if len(l) > 600]
    cands = ml if len(ml) >= 2 else (ml + bank_longs)
    if len(cands) >= 2:
        p = strip_q_fragment(common_prefix(cands))
        return p.strip(), 'common-prefix(%d cands)' % len(cands)
    if len(cands) == 1:
        l = cands[0]
        for kq in known_questions:
            idx = l.find(kq)
            if idx > 300:
                cut = l.rfind('. ', 0, idx)
                if cut > 300:
                    return strip_q_fragment(l[:cut+1]).strip(), 'known-q-cut'
        return strip_q_fragment(l).strip(), 'single-split'
    return None, 'FAIL'

QSTART = re.compile(r'^(What|Which|Why|How|Who|When|Where|Whose|Whom|According|The word|Select|Choose|Determine|In which|It is certain|The most)\b', re.I)
BND = re.compile(r'[.!?][”’")\]]{0,2} ')
def strip_q_fragment(p):
    """passage tail se trailing question/fragments hatao (loop).
    Boundary = sentence-punct + optional closing quote + space (quote-aware)."""
    while True:
        t = p.rstrip()
        ms = list(BND.finditer(t))
        if not ms: return p
        frag = t[ms[-1].end():]
        has_internal = len(list(BND.finditer(frag))) > 0
        strip = False
        if not has_internal and len(frag) < 250:
            if frag.endswith('?') or frag.endswith(':'):
                strip = True
            elif QSTART.match(frag) and '?' in frag:
                strip = True
            elif len(frag) < 15:   # tiny incomplete fragment ('When did Dr.')
                strip = True
        if strip:
            p = t[:ms[-1].end()]
            continue
        return p

# ---------- load bank ----------
bank = json.load(open(f'{ROOT}/data/bank-english.json'))
by8 = {r['id'][2:10]: r for r in bank}

# follow-up sid -> paper
GROUPS = {
  3:  ['62987203', '00f92afc'],
  4:  ['87ada0c5', '66c66bba', '543456ff'],
  5:  ['f36f8642', 'f8a5cf14', '265ab49f'],
  6:  ['cd497016', 'fe7b332c', 'a6fc8d1a'],
  7:  ['719f474e', 'fa54ba3b'],
  11: ['ef727d54', 'b3cb46b2', 'aba8a7d8'],
  12: ['217af178', '216401aa', '0e490632'],
  15: ['d5e2fde8', 'd9743e16'],
  17: ['41989232', 'b7fef15c', '6eef9f6c'],
  18: ['3c29d283', '186a1fe3', '6448d781'],
  20: ['3d850847', 'f46edb22', '65d1e0d0'],
  21: ['083e20cc', 'a8c0088c', '32cd933d'],
  23: ['fe8534c6', '6694720c', 'd6713c4c', '3364ffee'],
  25: ['377ad6ae', 'acde6691'],
  27: ['935143a2', 'c07517a2', '0ff16b93'],
  42: ['8a785163'],
  48: ['a4dd6040', 'db8b9b1f'],
  54: ['99ac3506', '22a8089b'],
  56: ['c1be53cd'],
  57: ['1c946787', '2ac1181f', '10b9f2c0'],
}
REMOVE = {
  14: ['570a102d'],   # P13 ae31bd60 exact twin (passage ke saath)
  21: ['ffad2df3'],   # P24 c5f37f6f exact twin (passage ke saath)
  61: ['7709826b', 'bf93d678', 'c7a28a71', '1be8b3b5'],
  63: ['c6257ea2', '01656629', 'bc562cd6', 'ba0160f9'],
  64: ['0fe305eb', '7471151b', 'fd72040e', '507dffd1'],
  65: ['ac137a9e', '556d25d1', 'f9f1adcf', 'edfd2b76'],
}

# single-candidate papers ke liye known question texts (fallback cut ke liye)
KNOWN_Q = {
  14: ('What did the miser hide under some stones?',),
  21: ('How does our brain dim our consciousness?',),
  27: ('Why did the greedy man rescue a fairy?',),
  42: ('What does the author say about a woman who always says that her baby is beautiful, perfect, and an angel?',),
}

# ---------- extraction dry-run ----------
print('='*80)
print('PASSAGE EXTRACTION (dry-run)')
print('='*80)
passages = {}
for pno in sorted(GROUPS):
    blongs = [r['questionText'] for r in bank
              if (r.get('paper') or {}).get('no') == pno and len(r['questionText']) > 400]
    p, how = extract_passage(pno, blongs, known_questions=KNOWN_Q.get(pno, ()))
    if not p:
        print(f'P{pno}: EXTRACTION FAILED!'); continue
    passages[pno] = p
    print(f'P{pno} [{how}] len={len(p)}')
    print(f'   head: {p[:100]}')
    print(f'   tail: {p[-90:]}')
    print()

# ---------- stem assembly ----------
def clean_question(q):
    q = re.sub(r'^Read the passage and answer:\s*', '', q.strip())
    q = re.sub(r'^Read the (given )?passage and answer (the )?(questions? )?that follow[s]?:?\s*', '', q)
    return q.strip()

print('='*80)
print('NEW STEMS (sample preview)')
print('='*80)
new_records = []
for pno, sids in sorted(GROUPS.items()):
    p = passages.get(pno)
    if not p: continue
    for sid in sids:
        r = by8[sid]
        old = r['questionText']
        q = clean_question(old)
        newstem = p + ' ' + q
        nr = copy.deepcopy(r)
        nr['questionText'] = newstem
        nr['questionTextHi'] = newstem        # passage-records convention: Hi = EN (English passage)
        nr['chapter'] = 'Reading Comprehension'
        nr['topic'] = 'Passage-based Question'
        new_records.append((sid, r, nr))

# e4bad13b: standalone stem+option corruption fix (no passage)
r = by8['e4bad13b']
glued = "Women are not valuable members of society and are not worthy of the same rights and opportunities as men."
nr = copy.deepcopy(r)
nr['questionText'] = "What is the importance of changing indifferent attitudes toward women's empowerment?"
nr['questionTextHi'] = nr['questionText']
nr['options'] = [dict(o) for o in r['options']]
nr['options'][0]['text'] = glued
new_records.append(('e4bad13b', r, nr))

# OCR join fixes (space daal do)
JOIN_FIX = {
  '898f52b2': [('wasaffected', 'was affected'), ('bythe', 'by the')],
  '24277808': [('Inthe', 'In the')],
  '353fedc6': [('doesnot', 'does not')],
  'ae599868': [('sameas', 'same as')],
  '4921c3c9': [('donot', 'do not')],
  'bab67b11': [('thisto', 'this to')],
}
for sid, fixes in JOIN_FIX.items():
    r = by8[sid]
    nr = copy.deepcopy(r)
    for a, b in fixes:
        nr['questionText'] = nr['questionText'].replace(a, b)
        nr['questionTextHi'] = nr['questionTextHi'].replace(a, b)
        for o in nr['options']:
            o['text'] = o['text'].replace(a, b)
            if o.get('textHi'): o['textHi'] = o['textHi'].replace(a, b)
    new_records.append((sid, r, nr))

for sid, old, new in new_records[:14]:
    print(f'[{sid}] NEW len={len(new["questionText"])}')
    print('   ', new['questionText'][:110])
    print('    ...tail:', new['questionText'][-90:])
print(f'... + {max(0, len(new_records)-14)} more')

# ---------- OCR-variant twin check (math-pass lesson) ----------
def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())
bank_norm = {}
for r in bank:
    key = norm(r['questionText']) + '||' + norm(' '.join(o['text'] for o in r['options']))
    bank_norm.setdefault(key, []).append(r['id'][2:10])
print('='*80)
print('OCR-VARIANT TWIN CHECK (patched vs bank)')
twins = 0
for sid, old, new in new_records:
    key = norm(new['questionText']) + '||' + norm(' '.join(o['text'] for o in new['options']))
    hit = [x for x in bank_norm.get(key, []) if x != sid]
    if hit:
        twins += 1
        print(f'  TWIN: {sid} ~ {hit} (normalized same — alag paper ka PYQ, dono rakh sakte hain)')
print(f'variant twins: {twins}')

# ---------- id/hash rebuild + collision checks ----------
all_ids = set(); all_dhs = set()
for f in ['bank-physics.json', 'bank-mathematics.json', 'bank-english.json', 'bank-raga.json']:
    for r in json.load(open(f'{ROOT}/data/{f}')):
        all_ids.add(r['id']); all_dhs.add(r['dupeHash'])

retire_dhs = []
collisions = 0
for sid, old, new in new_records:
    old_dh = old['dupeHash']
    new['dupeHash'] = dupe_id(new)
    new['id'] = content_id(new)
    if new['id'] in all_ids or new['dupeHash'] in all_dhs:
        print(f'COLLISION: {sid} -> {new["id"]} / {new["dupeHash"]}'); collisions += 1
    all_ids.add(new['id']); all_dhs.add(new['dupeHash'])
    if old_dh != new['dupeHash']:
        retire_dhs.append(old_dh)
    else:
        print(f'WARN: {sid} dupeHash unchanged!?')

removal_dhs = []
for pno, sids in REMOVE.items():
    for sid in sids:
        r = by8.get(sid)
        if not r: print(f'REMOVE MISSING: {sid}'); continue
        removal_dhs.append(r['dupeHash'])

print()
print('='*80)
print(f'REPAIRED: {len(new_records)} | RETIRED-v7 (patched old dh): {len(retire_dhs)}')
print(f'REMOVED: {len(removal_dhs)} | retire dhs total: {len(retire_dhs)+len(removal_dhs)}')
print(f'COLLISIONS: {collisions}')
print(f'bank count: {len(bank)} -> {len(bank) - len(removal_dhs)}')
print('='*80)

# ---------- APPLY ----------
if APPLY:
    out = [r for r in bank if r['id'][2:10] not in {s for sids in REMOVE.values() for s in sids}]
    patched = {sid: nr for sid, _, nr in new_records}
    for i, r in enumerate(out):
        sid = r['id'][2:10]
        if sid in patched: out[i] = patched[sid]
    json.dump(out, open(f'{ROOT}/data/bank-english.json', 'w'), ensure_ascii=False, indent=1)
    ret = json.load(open(f'{ROOT}/data/retired-raga.json'))
    ret['v7'] = retire_dhs + removal_dhs
    ret['v'] = 7
    ret['note'] = 'v7: v1.4.19 — english passage-merge (53), corruption fixes, 16 unrecoverable passage removals'
    json.dump(ret, open(f'{ROOT}/data/retired-raga.json', 'w'), ensure_ascii=False, indent=1)
    print('APPLIED: bank-english.json + retired-raga.json (v7) written')
else:
    print('DRY RUN — koi file nahi badli. --apply se apply hoga.')
