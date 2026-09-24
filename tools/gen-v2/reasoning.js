'use strict';
/* Reasoning — 100 Q (Number Series 12, Alphabet Series 12, Coding-Decoding 15,
   Analogy 18, Odd One Out 10, Blood Relations 8, Direction 7, Syllogism 10,
   Mathematical Operations 8) — SSC CHSL pattern */
const { Q, build } = require('./lib');
const SN = 'Reasoning';
const L = [];
const push = (ch, tp, q, opts, ans, exp) => L.push(Q('reasoning', SN, ch, tp, q, opts, ans, exp));

/* ─── Number Series (12) ─── */
const NS = 'Number Series';
push(NS, 'Number Series', 'Find the next number in the series: 2, 6, 12, 20, 30, ?', ['40', '42', '44', '46'], 'B',
  'The differences are 4, 6, 8, 10 — next difference is 12, so 30 + 12 = 42.');
push(NS, 'Number Series', 'Find the next number in the series: 3, 7, 15, 31, ?', ['47', '55', '63', '75'], 'C',
  'Each term is (previous × 2) + 1 — 3×2+1=7, 7×2+1=15, 15×2+1=31, so 31×2+1 = 63.');
push(NS, 'Number Series', 'Find the next number in the series: 1, 4, 9, 16, 25, ?', ['30', '36', '42', '49'], 'B',
  'These are perfect squares — 1², 2², 3², 4², 5², so the next is 6² = 36.');
push(NS, 'Number Series', 'Find the next number in the series: 5, 11, 23, 47, ?', ['87', '94', '95', '105'], 'C',
  'Each term is (previous × 2) + 1 — 5×2+1=11, 11×2+1=23, 23×2+1=47, so 47×2+1 = 95.');
push(NS, 'Number Series', 'Find the next number in the series: 8, 27, 64, 125, ?', ['196', '216', '225', '256'], 'B',
  'These are perfect cubes — 2³, 3³, 4³, 5³, so the next is 6³ = 216.');
push(NS, 'Number Series', 'Find the next number in the series: 100, 96, 88, 76, ?', ['60', '64', '68', '72'], 'A',
  'The differences are −4, −8, −12, so next is −16: 76 − 16 = 60.');
push(NS, 'Number Series', 'Find the next number in the series: 2, 3, 5, 8, 12, ?', ['15', '16', '17', '18'], 'C',
  'The differences are +1, +2, +3, +4, so next difference is +5: 12 + 5 = 17.');
push(NS, 'Number Series', 'Find the next number in the series: 4, 12, 36, 108, ?', ['216', '324', '432', '316'], 'B',
  'Each term is multiplied by 3 — 108 × 3 = 324.');
push(NS, 'Number Series', 'Find the next number in the series: 1, 1, 2, 3, 5, 8, ?', ['11', '12', '13', '15'], 'C',
  'This is the Fibonacci series — each term is the sum of the previous two: 5 + 8 = 13.');
push(NS, 'Number Series', 'Find the next number in the series: 121, 144, 169, 196, ?', ['210', '225', '236', '256'], 'B',
  'These are squares of consecutive numbers — 11², 12², 13², 14², so the next is 15² = 225.');
push(NS, 'Number Series', 'Find the next number in the series: 6, 11, 21, 36, 56, ?', ['71', '76', '81', '86'], 'C',
  'The differences are +5, +10, +15, +20, so next difference is +25: 56 + 25 = 81.');
push(NS, 'Number Series', 'Find the next number in the series: 7, 14, 28, 56, ?', ['98', '104', '112', '128'], 'C',
  'Each term is doubled — 56 × 2 = 112.');

/* ─── Alphabet Series (12) ─── */
const AS = 'Alphabet Series';
push(AS, 'Alphabet Series', 'Find the next term in the series: A, D, G, J, ?', ['K', 'L', 'M', 'N'], 'C',
  'Each letter moves +3 places — A(1), D(4), G(7), J(10), so next is 13 = M.');
push(AS, 'Alphabet Series', 'Find the next term in the series: B, E, H, K, ?', ['L', 'M', 'N', 'O'], 'C',
  'Each letter moves +3 places — B(2), E(5), H(8), K(11), so next is 14 = N.');
push(AS, 'Alphabet Series', 'Find the next term in the series: Z, X, V, T, ?', ['S', 'Q', 'R', 'P'], 'C',
  'Each letter moves −2 places — Z(26), X(24), V(22), T(20), so next is 18 = R.');
push(AS, 'Alphabet Series', 'Find the next term in the series: AZ, BY, CX, ?', ['DV', 'DW', 'EW', 'DX'], 'B',
  'First letters move forward (A, B, C, D) and second letters move backward (Z, Y, X, W) — so DW.');
push(AS, 'Alphabet Series', 'Find the next term in the series: AB, DE, GH, ?', ['IJ', 'JK', 'KL', 'IJ, KL'], 'B',
  'First letters: A(1), D(4), G(7), J(10) — each pair starts +3 ahead, letters consecutive. So JK.');
push(AS, 'Alphabet Series', 'Find the next term in the series: A, C, F, J, ?', ['K', 'M', 'N', 'O'], 'D',
  'The gaps are +2, +3, +4, so next gap is +5: J(10) + 5 = 15 = O.');
push(AS, 'Alphabet Series', 'Find the next term in the series: CE, GI, KM, ?', ['OQ', 'OP', 'PQ', 'PR'], 'A',
  'First letters: C(3), G(7), K(11) — +4 each, so O(15). Second letters: E(5), I(9), M(13) — +4 each, so Q(17). Answer OQ.');
push(AS, 'Alphabet Series', 'Find the next term in the series: D, H, L, P, ?', ['Q', 'R', 'S', 'T'], 'D',
  'Each letter moves +4 places — D(4), H(8), L(12), P(16), so next is 20 = T.');
push(AS, 'Alphabet Series', 'Find the next term in the series: B, C, E, H, ?', ['K', 'L', 'M', 'N'], 'B',
  'The gaps are +1, +2, +3, +4 — B(2), C(3), E(5), H(8), so H(8) + 4 = 12 = L.');
push(AS, 'Alphabet Series', 'Find the next term in the series: M, N, L, O, K, ?', ['J', 'P', 'Q', 'I'], 'B',
  'Two alternating series: M(13), L(12), K(11) decreasing and N(14), O(15) increasing — next is P(16).');
push(AS, 'Alphabet Series', 'Find the next term in the series: Y, W, U, S, ?', ['P', 'Q', 'R', 'T'], 'B',
  'Each letter moves −2 places — Y(25), W(23), U(21), S(19), so next is 17 = Q.');
push(AS, 'Alphabet Series', 'Find the next term in the series: AD, BE, CF, ?', ['DE', 'DG', 'EG', 'DF'], 'B',
  'First letters move +1 (A, B, C, D) and second letters move +1 (D, E, F, G) — so DG.');

/* ─── Coding-Decoding (15) ─── */
const CD = 'Coding-Decoding';
push(CD, 'Coding-Decoding', 'If CAT is coded as 3120 (C=3, A=1, T=20 — alphabet positions joined), then how is DOG coded?',
  ['4157', '4517', '4175', '4571'], 'A',
  'Each letter is replaced by its alphabet position and joined: C=3, A=1, T=20 → 3120. So D=4, O=15, G=7 → 4157.');
push(CD, 'Coding-Decoding', 'If MANGO is coded as 13-1-14-7-15 (alphabet positions), then GRAPE is coded as',
  ['7-18-1-16-5', '7-17-1-16-5', '8-18-1-15-5', '7-18-2-16-6'], 'A',
  'Alphabet positions: G=7, R=18, A=1, P=16, E=5 — so 7-18-1-16-5.');
push(CD, 'Coding-Decoding', 'If FRIEND is coded as GSJFOE, then MOTHER is coded as',
  ['NPUIFS', 'NQVJFS', 'NPTIFS', 'NPVJFS'], 'A',
  'Each letter moves +1: M→N, O→P, T→U, H→I, E→F, R→S — NPUIFS.');
push(CD, 'Coding-Decoding', 'If TEACHER is coded as QBXZEBO (each letter −3), then SCHOOL is coded as',
  ['PZELLI', 'PZLLEI', 'QZELLI', 'PZELLJ'], 'A',
  'Each letter moves −3 (wrapping around): S→P, C→Z, H→E, O→L, O→L, L→I — PZELLI.');
push(CD, 'Coding-Decoding', 'If ROAD is coded as SDBE, then LANE is coded as',
  ['MBOF', 'MAOF', 'MBPF', 'KZMD'], 'A',
  'Each letter moves +1: L→M, A→B, N→O, E→F — MBOF.');
push(CD, 'Coding-Decoding', 'If WATER is coded as YCVGT (each letter +2), then EARTH is coded as',
  ['GCTVJ', 'GCTVI', 'GDUVJ', 'FCTVJ'], 'A',
  'Each letter moves +2: E→G, A→C, R→T, T→V, H→J — GCTVJ.');
push(CD, 'Coding-Decoding', 'If DELHI is coded as IHLED (letters written in reverse), then MUMBAI is coded as',
  ['IABMUM', 'IABMVM', 'IAMBUM', 'IABNUM'], 'A',
  'Reversing the letters of MUMBAI gives I-A-B-M-U-M — IABMUM.');
push(CD, 'Coding-Decoding', 'If PEN is coded as NEP (letters written in reverse), then INK is coded as',
  ['KNI', 'NKI', 'NIK', 'IKM'], 'A',
  'Reversing the letters of INK gives K-N-I — KNI.');
push(CD, 'Coding-Decoding', 'If BOOK is coded as CPPL (each letter +1), then PEN is coded as',
  ['QFO', 'QFN', 'QEO', 'RFO'], 'A',
  'Each letter moves +1: P→Q, E→F, N→O — QFO.');
push(CD, 'Coding-Decoding', 'If CAB is coded as 6 (3+1+2, sum of alphabet positions), then BEAD is coded as',
  ['11', '12', '13', '14'], 'B',
  'B=2, E=5, A=1, D=4 — sum = 2+5+1+4 = 12.');
push(CD, 'Coding-Decoding', 'If FLOWER is coded as GMPXFS, then GARDEN is coded as',
  ['HBSEFO', 'HBSDEO', 'HBSEOD', 'HASEFO'], 'A',
  'Each letter moves +1: G→H, A→B, R→S, D→E, E→F, N→O — HBSEFO.');
push(CD, 'Coding-Decoding', 'If LION is coded as OLRQ (each letter +3), then TIGER is coded as',
  ['WLJHU', 'WLJIU', 'WKJHU', 'WMJHU'], 'A',
  'Each letter moves +3: T→W, I→L, G→J, E→H, R→U — WLJHU.');
push(CD, 'Coding-Decoding', 'If INDIA is coded as KPFKC (each letter +2), then NEPAL is coded as',
  ['PGRCN', 'PGRBN', 'PFRCN', 'QGRCN'], 'A',
  'Each letter moves +2: N→P, E→G, P→R, A→C, L→N — PGRCN.');
push(CD, 'Coding-Decoding', "If 'white' is called 'red', 'red' is called 'blue', 'blue' is called 'yellow' and 'yellow' is called 'black', then what is the colour of milk called?",
  ['red', 'blue', 'yellow', 'black'], 'A',
  'Milk is white, and white is called "red" in this code — so the colour of milk is called red.');
push(CD, 'Coding-Decoding', 'If MOUSE is coded as PRXVH (each letter +3), then CLICK is coded as',
  ['FOLFN', 'FLOFN', 'FOKFN', 'FPLFN'], 'A',
  'Each letter moves +3: C→F, L→O, I→L, C→F, K→N — FOLFN.');

/* ─── Analogy (18) ─── */
const AN = 'Analogy';
push(AN, 'Word Analogy', "'Doctor' is related to 'Hospital' in the same way as 'Teacher' is related to:",
  ['Books', 'School', 'Students', 'Office'], 'B',
  'A doctor works in a hospital; in the same way a teacher works in a school.');
push(AN, 'Word Analogy', "'Pen' is related to 'Write' in the same way as 'Knife' is related to:",
  ['Sharp', 'Kitchen', 'Cut', 'Metal'], 'C',
  'A pen is used to write; a knife is used to cut. The relation is object and its primary function.');
push(AN, 'Word Analogy', "'Bird' is related to 'Nest' in the same way as 'Bee' is related to:",
  ['Honey', 'Flower', 'Hive', 'Garden'], 'C',
  'A bird lives in a nest; a bee lives in a hive.');
push(AN, 'Word Analogy', "'Cow' is related to 'Milk' in the same way as 'Hen' is related to:",
  ['Feather', 'Egg', 'Chick', 'Cock'], 'B',
  'A cow gives milk; a hen gives eggs — animal and its produce.');
push(AN, 'Word Analogy', "'Book' is related to 'Author' in the same way as 'Painting' is related to:",
  ['Canvas', 'Painter', 'Colour', 'Museum'], 'B',
  'A book is created by an author; a painting is created by a painter — work and its creator.');
push(AN, 'Word Analogy', "'Sun' is related to 'Day' in the same way as 'Moon' is related to:",
  ['Light', 'Night', 'Star', 'Sky'], 'B',
  'The sun gives light during the day; the moon is associated with the night.');
push(AN, 'Word Analogy', "'India' is related to 'Rupee' in the same way as 'Japan' is related to:",
  ['Yuan', 'Yen', 'Won', 'Dollar'], 'B',
  'The currency of India is the rupee; the currency of Japan is the yen.');
push(AN, 'Word Analogy', "'Dog' is related to 'Puppy' in the same way as 'Cat' is related to:",
  ['Calf', 'Kitten', 'Cub', 'Lamb'], 'B',
  'The young one of a dog is a puppy; the young one of a cat is a kitten.');
push(AN, 'Word Analogy', "'Foot' is related to 'Shoe' in the same way as 'Hand' is related to:",
  ['Ring', 'Glove', 'Watch', 'Finger'], 'B',
  'A shoe is worn on the foot; a glove is worn on the hand.');
push(AN, 'Number Analogy', "'8' is related to '64' in the same way as '9' is related to:",
  ['72', '81', '90', '99'], 'B',
  '64 is the square of 8; likewise the square of 9 is 81.');
push(AN, 'Number Analogy', "'3' is related to '27' in the same way as '4' is related to:",
  ['12', '16', '64', '81'], 'C',
  '27 is the cube of 3; likewise the cube of 4 is 64.');
push(AN, 'Number Analogy', "'12' is related to '144' in the same way as '15' is related to:",
  ['150', '180', '225', '256'], 'C',
  '144 is the square of 12; likewise the square of 15 is 225.');
push(AN, 'Number Analogy', "'6' is related to '42' in the same way as '8' is related to:",
  ['56', '64', '72', '80'], 'C',
  '6 × 7 = 42 (number × next number); likewise 8 × 9 = 72.');
push(AN, 'Number Analogy', "'100' is related to '10' in the same way as '49' is related to:",
  ['5', '6', '7', '8'], 'C',
  '10 is the square root of 100; likewise the square root of 49 is 7.');
push(AN, 'Number Analogy', "'5' is related to '30' in the same way as '7' is related to:",
  ['42', '49', '56', '63'], 'C',
  '5 × 6 = 30 (number × number + 1); likewise 7 × 8 = 56.');
push(AN, 'Word Analogy', "'Ocean' is related to 'Water' in the same way as 'Desert' is related to:",
  ['Camel', 'Sand', 'Heat', 'Oasis'], 'B',
  'An ocean is a vast expanse of water; a desert is a vast expanse of sand.');
push(AN, 'Instrument Analogy', "'Thermometer' is related to 'Temperature' in the same way as 'Barometer' is related to:",
  ['Humidity', 'Pressure', 'Wind', 'Rainfall'], 'B',
  'A thermometer measures temperature; a barometer measures atmospheric pressure.');
push(AN, 'Word Analogy', "'Poet' is related to 'Poem' in the same way as 'Composer' is related to:",
  ['Singer', 'Music', 'Instrument', 'Concert'], 'B',
  'A poet creates a poem; a composer creates music — creator and creation.');

/* ─── Odd One Out (10) ─── */
const OOO = 'Odd One Out';
push(OOO, 'Odd One Out', 'Find the odd one out: 2, 3, 5, 7, 9', ['2', '3', '5', '9'], 'D',
  'All are prime numbers except 9 (= 3 × 3), which is not prime.');
push(OOO, 'Odd One Out', 'Find the odd one out: 10, 15, 20, 24, 30', ['10', '20', '24', '30'], 'C',
  'All are multiples of 5 except 24.');
push(OOO, 'Odd One Out', 'Find the odd one out: 64, 125, 216, 343, 100', ['64', '125', '100', '343'], 'C',
  '64, 125, 216 and 343 are perfect cubes (4³, 5³, 6³, 7³); 100 is not a cube.');
push(OOO, 'Odd One Out', 'Find the odd one out: Mango, Apple, Potato, Banana', ['Mango', 'Apple', 'Potato', 'Banana'], 'C',
  'Potato is a vegetable; the rest are fruits.');
push(OOO, 'Odd One Out', 'Find the odd one out: Snake, Lizard, Crocodile, Whale', ['Snake', 'Lizard', 'Crocodile', 'Whale'], 'D',
  'Whale is a mammal; snake, lizard and crocodile are reptiles.');
push(OOO, 'Odd One Out', 'Find the odd one out: Triangle, Square, Circle, Cube', ['Triangle', 'Square', 'Circle', 'Cube'], 'D',
  'Cube is a three-dimensional figure; the rest are two-dimensional.');
push(OOO, 'Odd One Out', 'Find the odd one out: 121, 144, 169, 190', ['121', '144', '169', '190'], 'D',
  '121 (11²), 144 (12²) and 169 (13²) are perfect squares; 190 is not.');
push(OOO, 'Odd One Out', 'Find the odd one out: Sun, Moon, Star, Lamp', ['Sun', 'Moon', 'Star', 'Lamp'], 'D',
  'Lamp is a man-made object; the rest are natural celestial bodies.');
push(OOO, 'Odd One Out', 'Find the odd one out: 1, 4, 9, 15, 25', ['1', '4', '9', '15'], 'D',
  '1 (1²), 4 (2²), 9 (3²) and 25 (5²) are perfect squares; 15 is not.');
push(OOO, 'Odd One Out', 'Find the odd one out: Cabbage, Cauliflower, Carrot, Lettuce', ['Cabbage', 'Cauliflower', 'Carrot', 'Lettuce'], 'C',
  'Carrot is a root vegetable; cabbage and lettuce are leafy vegetables and cauliflower is a flower vegetable.');

/* ─── Blood Relations (8) ─── */
const BR = 'Blood Relations';
push(BR, 'Blood Relations', 'Pointing to a photograph, Ram said, "She is the daughter of my grandfather\'s only son." How is the girl related to Ram?',
  ['Sister', 'Cousin', 'Aunt', 'Mother'], 'A',
  'Grandfather\'s only son = Ram\'s father. His daughter is Ram\'s sister.');
push(BR, 'Blood Relations', 'A is the father of B. B is the mother of C. How is A related to C?',
  ['Father', 'Grandfather', 'Uncle', 'Brother'], 'B',
  'A is the father of B (C\'s mother), so A is C\'s maternal grandfather.');
push(BR, 'Blood Relations', 'Pointing to a man, Sita said, "His mother is the only daughter of my mother." How is Sita related to the man?',
  ['Sister', 'Aunt', 'Mother', 'Grandmother'], 'C',
  'The only daughter of Sita\'s mother is Sita herself. So the man\'s mother is Sita — Sita is his mother.');
push(BR, 'Blood Relations', 'X is the brother of Y. Y is the sister of Z. How is X related to Z?',
  ['Brother', 'Sister', 'Father', 'Cannot be determined'], 'A',
  'X and Z are siblings through Y; X being male is Z\'s brother.');
push(BR, 'Blood Relations', 'Mohan said, "This girl is the wife of the grandson of my mother." How is Mohan related to the girl?',
  ['Father', 'Father-in-law', 'Grandfather', 'Brother-in-law'], 'B',
  'The grandson of Mohan\'s mother (other than Mohan himself) is Mohan\'s son. The wife of Mohan\'s son is Mohan\'s daughter-in-law — so Mohan is the girl\'s father-in-law.');
push(BR, 'Blood Relations', "If 'P + Q' means 'P is the father of Q' and 'P − Q' means 'P is the wife of Q', then in the expression P + Q − R, how is P related to R?",
  ['Father', 'Father-in-law', 'Brother-in-law', 'Grandfather'], 'B',
  'P is the father of Q, and Q is the wife of R. So P is the father of R\'s wife — R\'s father-in-law.');
push(BR, 'Blood Relations', 'Pointing to a woman, a man said, "Her father is the only son of my father." How is the woman related to the man?',
  ['Sister', 'Daughter', 'Niece', 'Cousin'], 'B',
  'The only son of the man\'s father is the man himself. So the woman\'s father is the man — she is his daughter.');
push(BR, 'Blood Relations', 'Introducing a boy, a girl said, "He is the son of my father\'s only son." How is the boy related to the girl?',
  ['Brother', 'Son', 'Nephew', 'Cousin'], 'C',
  'The only son of the girl\'s father is the girl\'s brother. The son of her brother is the girl\'s nephew.');

/* ─── Direction Sense (7) ─── */
const DR = 'Direction Sense';
push(DR, 'Direction Sense', 'A man walks 5 km towards north, turns right and walks 3 km, then turns right again and walks 5 km. How far is he from the starting point?',
  ['3 km', '5 km', '8 km', '13 km'], 'A',
  'He walks 5 km north, then 3 km east, then 5 km south — the 5 km walks cancel out, leaving 3 km east of the start.');
push(DR, 'Direction Sense', 'Ravi walks 10 m towards south, turns left and walks 10 m, then turns left again and walks 10 m. Which direction is he facing now?',
  ['East', 'West', 'North', 'South'], 'C',
  'Facing south, a left turn faces east; another left turn faces north — he is now facing north (10 m east of start).');
push(DR, 'Direction Sense', 'In the morning, a person\'s shadow falls exactly to his right. Which direction is he facing?',
  ['North', 'South', 'East', 'West'], 'B',
  'In the morning the shadow falls towards the west. If west is to his right, he must be facing south.');
push(DR, 'Direction Sense', 'A person walks 3 km towards east, then 4 km towards north. How far is he from the starting point?',
  ['4 km', '5 km', '6 km', '7 km'], 'B',
  'By Pythagoras theorem: √(3² + 4²) = √25 = 5 km.');
push(DR, 'Direction Sense', 'If South-East becomes North and North-East becomes West, and all directions change in the same way, then what will West become?',
  ['North-East', 'South-East', 'South', 'North-West'], 'B',
  'The whole compass rotates 135° anticlockwise (SE → N). Applying the same rotation, West (270°) → 135° = South-East.');
push(DR, 'Direction Sense', 'A man facing west turns 90° clockwise, then 180° anticlockwise. Which direction is he facing now?',
  ['North', 'East', 'South', 'West'], 'C',
  'West + 90° clockwise = North; North − 180° = South. He is facing south.');
push(DR, 'Direction Sense', 'K is 40 m to the south of L. M is 30 m to the east of K. What is the shortest distance between L and M?',
  ['40 m', '45 m', '50 m', '70 m'], 'C',
  'The triangle LKM is right-angled at K with legs 40 m and 30 m — distance = √(40² + 30²) = 50 m.');

/* ─── Syllogism (10) ─── */
const SYL = 'Syllogism';
const syl2 = (st, concl, ans, exp) => push(SYL, 'Syllogism', `Statements: ${st} Conclusion: ${concl} — Choose the correct option.`,
  ['The conclusion follows', 'The conclusion does not follow', 'Data is inadequate', 'None of these'], ans, exp);
syl2('All cats are dogs. All dogs are animals.', 'All cats are animals.', 'A',
  'All cats are within dogs, and all dogs are within animals — so all cats are animals. The conclusion follows.');
syl2('Some flowers are red. All red things are beautiful.', 'Some flowers are beautiful.', 'A',
  'The flowers that are red are also beautiful (all red things are) — so some flowers are beautiful. Follows.');
syl2('No pen is a pencil. All pencils are erasers.', 'Some erasers are pencils.', 'A',
  'All pencils are erasers means at least some erasers are pencils. Follows.');
syl2('All books are pens. Some pens are pencils.', 'Some books are pencils.', 'B',
  'The pencils that are pens may all be pens that are not books — so it is not certain that any book is a pencil. Does not follow.');
syl2('All A are B. No B is C.', 'No A is C.', 'A',
  'Since every A is inside B, and B is completely outside C, no A can be C. Follows.');
syl2('Some apples are mangoes. All mangoes are sweet.', 'Some apples are sweet.', 'A',
  'The apples that are mangoes are also sweet (all mangoes are sweet). Follows.');
syl2('All teachers are graduates. Some graduates are officers.', 'Some teachers are officers.', 'B',
  'The officers among graduates may be graduates who are not teachers. Does not follow.');
syl2('No dog is a cat. All cats are animals.', 'Some animals are not dogs.', 'A',
  'All cats are animals, and no cat is a dog — so those animals (cats) are not dogs. Follows.');
syl2('All rings are circles. All circles are round.', 'All rings are round.', 'A',
  'Rings are inside circles, and circles are round — so all rings are round. Follows.');
syl2('Some chairs are tables. No table is a bench.', 'Some chairs are not benches.', 'A',
  'The chairs that are tables cannot be benches (no table is a bench) — so some chairs are not benches. Follows.');

/* ─── Mathematical Operations (8) ─── */
const MO = 'Mathematical Operations';
push(MO, 'Mathematical Operations', "If '×' means '÷', '÷' means '−', '+' means '×' and '−' means '+', then find the value of: 9 × 3 ÷ 2 + 4 − 6",
  ['1', '3', '5', '7'], 'A',
  'Replacing the signs: 9 ÷ 3 − 2 × 4 + 6 = 3 − 8 + 6 = 1.');
push(MO, 'Mathematical Operations', "If '÷' means '+', '×' means '÷', '−' means '×' and '+' means '−', then find the value of: 12 ÷ 4 × 3 − 6 + 8",
  ['10', '11', '12', '14'], 'C',
  'Replacing the signs: 12 + 4 ÷ 3 × 6 − 8 = 12 + (4/3 × 6 = 8) − 8 = 12.');
push(MO, 'Mathematical Operations', 'If 5 × 4 = 15 and 7 × 6 = 35, then 9 × 8 = ?',
  ['54', '63', '72', '81'], 'B',
  'Pattern: first number × (second number − 1) — 5 × 3 = 15, 7 × 5 = 35, so 9 × 7 = 63.');
push(MO, 'Mathematical Operations', 'If 5 + 3 = 28 and 9 + 1 = 810, then 7 + 4 = ?',
  ['311', '313', '331', '113'], 'A',
  'Pattern: (difference)(sum) written together — 5−3=2, 5+3=8 → 28; 9−1=8, 9+1=10 → 810; so 7−4=3, 7+4=11 → 311.');
push(MO, 'Mathematical Operations', 'If 4 × 2 = 24 and 5 × 3 = 40, then 6 × 4 = ?',
  ['50', '54', '60', '64'], 'C',
  'Pattern: (sum of the two numbers) × first number — (4+2) × 4 = 24, (5+3) × 5 = 40, so (6+4) × 6 = 60.');
push(MO, 'Mathematical Operations', 'If the signs + and − are interchanged, and the numbers 4 and 8 are also interchanged, then the value of 8 + 4 − 2 becomes:',
  ['−2', '0', '2', '6'], 'A',
  'After interchanging: 4 − 8 + 2 = −2.');
push(MO, 'Mathematical Operations', "If '×' means 'plus' and '+' means 'minus', then find the value of: 7 × 4 + 2",
  ['5', '7', '9', '11'], 'C',
  'Replacing the signs: 7 + 4 − 2 = 9.');
push(MO, 'Mathematical Operations', 'If 2 = 5, 4 = 18 and 6 = 39, then 8 = ?',
  ['58', '64', '68', '72'], 'C',
  'Pattern: n² + (n ÷ 2) — 2²+1 = 5, 4²+2 = 18, 6²+3 = 39, so 8²+4 = 68.');

const cnt = {};
for (const q of L) cnt[q.chapter] = (cnt[q.chapter] || 0) + 1;
console.error('RN chapters:', JSON.stringify(cnt), 'total:', L.length);
build('reasoning', SN, L);
