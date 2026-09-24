'use strict';
/* Mathematics — 100 Q (Percentage 12, P&L 10, SI/CI 8, Ratio 8, Average 8,
   Time & Work 8, Speed-Distance 8, Number System 8, Algebra 8, Geometry 8,
   Mensuration 8, Trigonometry 6) — SSC CHSL pattern */
const { Q, build } = require('./lib');
const SN = 'Mathematics';
const L = [];
const push = (ch, q, opts, ans, exp) => L.push(Q('mathematics', SN, ch, ch, q, opts, ans, exp));

/* ─── Percentage (12) ─── */
const PC = 'Percentage';
push(PC, 'What is 45% of 360?', ['152', '162', '172', '180'], 'B',
  '45% of 360 = (45 × 360) ÷ 100 = 162.');
push(PC, 'A number increased by 20% becomes 150. What is the number?',
  ['120', '125', '130', '135'], 'B',
  'x × 1.20 = 150 → x = 150 ÷ 1.2 = 125. Check: 125 + 20% of 125 (25) = 150.');
push(PC, 'If 30% of a number is 45, then the number is:',
  ['135', '140', '150', '160'], 'C',
  '0.30 × x = 45 → x = 45 ÷ 0.30 = 150.');
push(PC, 'The price of rice increases by 25%. By what percentage must a family reduce its consumption so that the expenditure remains the same?',
  ['20%', '25%', '22.5%', '15%'], 'A',
  'Reduction % = 25/(100+25) × 100 = 25/125 × 100 = 20%.');
push(PC, 'In an examination, a student scoring 30% marks fails by 20 marks, while another student scoring 45% marks gets 10 marks more than the pass marks. What are the pass marks?',
  ['70', '75', '80', '85'], 'C',
  '0.45T − 10 = 0.30T + 20 → 0.15T = 30 → T = 200. Pass marks = 0.30 × 200 + 20 = 80.');
push(PC, 'The population of a town is 5,000. It increases by 10% in the first year and decreases by 10% in the second year. What is the population at the end of two years?',
  ['4,950', '5,000', '5,050', '4,900'], 'A',
  '5000 × 1.10 × 0.90 = 5500 × 0.90 = 4950. (A 10% rise and 10% fall always give a net 1% decrease.)');
push(PC, "A's salary is 25% more than B's salary. B's salary is what per cent less than A's?",
  ['20%', '25%', '22.5%', '30%'], 'A',
  'Less % = 25/(100+25) × 100 = 20%.');
push(PC, 'In a class, 60% students play cricket, 30% play football and 10% play both. What percentage plays neither game?',
  ['10%', '15%', '20%', '25%'], 'C',
  'Play at least one = 60 + 30 − 10 = 80%. Neither = 100 − 80 = 20%.');
push(PC, 'A man spends 75% of his income. His income increases by 20% and his expenditure increases by 10%. By what percentage do his savings increase?',
  ['40%', '45%', '50%', '55%'], 'C',
  'Let income = 100: savings = 25. New income = 120, expenditure = 75 × 1.10 = 82.5, savings = 37.5. Increase = 12.5/25 × 100 = 50%.');
push(PC, 'In an examination, 65% of the students passed. If the number of failed students is 210, what is the total number of students?',
  ['560', '600', '640', '700'], 'B',
  'Failed % = 100 − 65 = 35%. 35% of T = 210 → T = 210 × 100/35 = 600.');
push(PC, 'What is the result when 80 is reduced by 15%?',
  ['65', '68', '70', '72'], 'B',
  '15% of 80 = 12; 80 − 12 = 68.');
push(PC, 'The value of x% of y + y% of x is:',
  ['xy/100', '2xy/100', 'x + y/100', 'xy'], 'B',
  'x% of y = xy/100 and y% of x = xy/100 — together 2xy/100.');

/* ─── Profit & Loss (10) ─── */
const PL = 'Profit & Loss';
push(PL, 'A trader buys an article for ₹400 and sells it for ₹500. What is his profit percentage?',
  ['20%', '25%', '30%', '35%'], 'B',
  'Profit = 500 − 400 = 100. Profit % = 100/400 × 100 = 25%.');
push(PL, 'An article is sold for ₹540 at a loss of 10%. What is its cost price?',
  ['₹580', '₹594', '₹600', '₹610'], 'C',
  'SP = 90% of CP → 540 = 0.90 × CP → CP = ₹600.');
push(PL, 'By selling an article for ₹960, a shopkeeper earns a profit of 20%. What is the cost price of the article?',
  ['₹780', '₹800', '₹820', '₹840'], 'B',
  'SP = 120% of CP → 960 = 1.2 × CP → CP = ₹800.');
push(PL, 'Two articles are sold at ₹990 each — one at a profit of 10% and the other at a loss of 10%. What is the overall result?',
  ['No profit no loss', '1% loss', '1% profit', '2% loss'], 'B',
  'CP₁ = 990/1.1 = 900, CP₂ = 990/0.9 = 1100. Total CP = 2000, total SP = 1980 — loss = 20/2000 = 1%. (Same SP with equal +/− % always gives a loss of x²/100 %.)');
push(PL, 'If the cost price of 12 articles equals the selling price of 10 articles, what is the profit percentage?',
  ['15%', '18%', '20%', '25%'], 'C',
  'Let CP of each = ₹1. CP of 12 = 12; SP of 10 = 12 → SP of each = 1.2. Profit % = 0.2/1 × 100 = 20%.');
push(PL, 'A shopkeeper gives a discount of 20% on an article marked ₹750. What is its selling price?',
  ['₹580', '₹600', '₹620', '₹640'], 'B',
  'Discount = 20% of 750 = 150; SP = 750 − 150 = ₹600.');
push(PL, 'A trader marks his goods 40% above the cost price and allows a discount of 15%. What is his profit percentage?',
  ['17%', '19%', '21%', '25%'], 'B',
  'Let CP = 100. MP = 140; SP = 140 × 0.85 = 119. Profit = 19%.');
push(PL, 'A shopkeeper sells his goods at cost price but uses a weight of 800 g instead of 1 kg. What is his profit percentage?',
  ['20%', '22.5%', '25%', '30%'], 'C',
  'He gives 800 g but takes money of 1000 g. Profit = 200/800 × 100 = 25%.');
push(PL, 'A person buys 6 pens for ₹30 and sells 3 pens for ₹20. What is his profit percentage?',
  ['25%', '30%', '33⅓%', '40%'], 'C',
  'CP per pen = 30/6 = ₹5; SP per pen = 20/3 = ₹6.67. Profit per pen = 5/3. Profit % = (5/3)/5 × 100 = 33⅓%.');
push(PL, 'A sells a cycle to B at a profit of 20% and B sells it to C at a profit of 25%. If C pays ₹450, what was A\'s cost price?',
  ['₹280', '₹300', '₹320', '₹350'], 'B',
  'CP_A × 1.20 × 1.25 = 450 → CP_A = 450/1.5 = ₹300.');

/* ─── Simple/Compound Interest (8) ─── */
const SI = 'Interest';
push(SI, 'Find the simple interest on ₹5,000 at 8% per annum for 3 years.',
  ['₹1,100', '₹1,200', '₹1,300', '₹1,400'], 'B',
  'SI = PRT/100 = (5000 × 8 × 3)/100 = ₹1,200.');
push(SI, 'At what rate of simple interest per annum will a sum double itself in 8 years?',
  ['10%', '12.5%', '15%', '20%'], 'B',
  'To double, SI = P: P = (P × R × 8)/100 → R = 100/8 = 12.5%.');
push(SI, 'Find the compound interest on ₹8,000 at 10% per annum for 2 years.',
  ['₹1,600', '₹1,680', '₹1,720', '₹1,800'], 'B',
  'Amount = 8000 × (1.1)² = 9680. CI = 9680 − 8000 = ₹1,680.');
push(SI, 'In how many years will ₹2,000 amount to ₹2,600 at 5% per annum simple interest?',
  ['4 years', '5 years', '6 years', '7 years'], 'C',
  'SI = 600 = (2000 × 5 × T)/100 = 100T → T = 6 years.');
push(SI, 'The difference between compound interest and simple interest on ₹10,000 at 10% per annum for 2 years is:',
  ['₹50', '₹100', '₹150', '₹200'], 'B',
  'Difference = P(R/100)² = 10000 × (0.1)² = ₹100.');
push(SI, 'A sum amounts to ₹12,100 in 2 years at 10% per annum compound interest. What is the sum?',
  ['₹10,000', '₹10,500', '₹11,000', '₹9,800'], 'A',
  'P = 12100/(1.1)² = 12100/1.21 = ₹10,000.');
push(SI, 'The simple interest on a sum at 6% per annum for 3 years is ₹900. What is the sum?',
  ['₹4,500', '₹5,000', '₹5,500', '₹6,000'], 'B',
  'P = (SI × 100)/(R × T) = (900 × 100)/(6 × 3) = ₹5,000.');
push(SI, 'A sum becomes 3 times itself in 20 years at simple interest. What is the rate of interest per annum?',
  ['8%', '10%', '12%', '15%'], 'B',
  'To triple, SI = 2P: 2P = (P × R × 20)/100 → R = 10%.');

/* ─── Ratio & Proportion (8) ─── */
const RA = 'Ratio & Proportion';
push(RA, '₹1,200 is divided between X and Y in the ratio 2 : 3. What is the smaller share?',
  ['₹420', '₹480', '₹500', '₹720'], 'B',
  'Total parts = 5; X\'s share = (2/5) × 1200 = ₹480.');
push(RA, 'If A : B = 3 : 4 and B : C = 2 : 3, then A : C = ?',
  ['1 : 2', '2 : 3', '3 : 4', '2 : 5'], 'A',
  'A : C = (3/4) × (2/3) = 6/12 = 1 : 2.');
push(RA, 'In a school, the ratio of boys to girls is 5 : 4 and the total number of students is 360. How many boys are there?',
  ['180', '200', '220', '240'], 'B',
  'Boys = (5/9) × 360 = 200.');
push(RA, 'Two numbers are in the ratio 3 : 5 and their difference is 24. What is their sum?',
  ['84', '90', '96', '108'], 'C',
  'Numbers are 3x and 5x; 5x − 3x = 24 → x = 12. Sum = 8x = 96.');
push(RA, 'The ratio of income to expenditure of a family is 5 : 3. If the family saves ₹4,000 per month, what is its monthly income?',
  ['₹8,000', '₹10,000', '₹12,000', '₹15,000'], 'B',
  'Savings = 5x − 3x = 2x = 4000 → x = 2000. Income = 5x = ₹10,000.');
push(RA, 'A mixture of 36 litres has milk and water in the ratio 5 : 1. How much milk is in the mixture?',
  ['24 L', '28 L', '30 L', '32 L'], 'C',
  'Milk = (5/6) × 36 = 30 litres.');
push(RA, 'If a : b = 2 : 3 and b : c = 4 : 5, then a : b : c = ?',
  ['8 : 12 : 15', '2 : 3 : 5', '8 : 12 : 20', '2 : 4 : 5'], 'A',
  'a : b = 2 : 3 = 8 : 12 and b : c = 4 : 5 = 12 : 15 — so a : b : c = 8 : 12 : 15.');
push(RA, '₹3,000 is divided among A, B and C in the ratio 2 : 3 : 5. What is B\'s share?',
  ['₹600', '₹750', '₹900', '₹1,000'], 'C',
  'B = (3/10) × 3000 = ₹900.');

/* ─── Average (8) ─── */
const AV = 'Average';
push(AV, 'What is the average of 10, 20, 30, 40 and 50?',
  ['25', '30', '35', '40'], 'B',
  'Sum = 150; average = 150/5 = 30.');
push(AV, 'What is the average of the first 10 natural numbers?',
  ['5', '5.5', '6', '6.5'], 'B',
  'Sum = 10 × 11/2 = 55; average = 55/10 = 5.5.');
push(AV, 'The average of 5 numbers is 27. If one number is excluded, the average becomes 25. What is the excluded number?',
  ['30', '32', '35', '37'], 'C',
  'Excluded = 5 × 27 − 4 × 25 = 135 − 100 = 35.');
push(AV, 'The average age of 30 students of a class is 12 years. If the teacher\'s age is included, the average increases by one year. What is the teacher\'s age?',
  ['40 years', '41 years', '43 years', '45 years'], 'C',
  'Teacher = 31 × 13 − 30 × 12 = 403 − 360 = 43 years.');
push(AV, 'A batsman scores an average of 40 runs in 5 innings. How many runs must he score in the 6th innings to raise his average to 42?',
  ['46', '48', '50', '52'], 'D',
  'Required = 6 × 42 − 5 × 40 = 252 − 200 = 52 runs.');
push(AV, 'What is the average of the first 8 odd natural numbers?',
  ['7', '8', '9', '10'], 'B',
  'Sum = 1 + 3 + 5 + 7 + 9 + 11 + 13 + 15 = 64; average = 64/8 = 8. (Average of first n odd numbers is always n.)');
push(AV, 'The average of A, B and C is 45. If A = 40 and B = 50, what is the value of C?',
  ['40', '45', '50', '55'], 'B',
  'A + B + C = 135 → C = 135 − 90 = 45.');
push(AV, 'The average age of 11 players of a cricket team is 25 years. If the wicketkeeper is excluded, the average becomes 24 years. What is the wicketkeeper\'s age?',
  ['33 years', '34 years', '35 years', '36 years'], 'C',
  'Wicketkeeper = 11 × 25 − 10 × 24 = 275 − 240 = 35 years.');

/* ─── Time & Work (8) ─── */
const TW = 'Time & Work';
push(TW, 'A can complete a work in 12 days and B in 18 days. Working together, in how many days will they complete the work?',
  ['7 days', '7⅕ days', '8 days', '7½ days'], 'B',
  'One-day work = 1/12 + 1/18 = 5/36. Time = 36/5 = 7⅕ days.');
push(TW, 'A and B together can do a work in 6 days. A alone can do it in 10 days. In how many days can B alone do it?',
  ['12 days', '14 days', '15 days', '16 days'], 'C',
  'B\'s one-day work = 1/6 − 1/10 = 1/15 → B alone takes 15 days.');
push(TW, 'A is twice as good a workman as B, and together they finish a work in 18 days. In how many days can A alone finish it?',
  ['24 days', '27 days', '30 days', '36 days'], 'B',
  'Let B take 2x days, A takes x. x·2x/(3x) = 18 → 2x = 36, x = 18? No: together time = 2x²/3x... Using units: A = 2 units/day, B = 1 unit/day, total work = 3 × 18 = 54 units. A alone = 54/2 = 27 days.');
push(TW, 'A can do a work in 12 days. He works for 4 days and leaves. The remaining work is done by B in 8 days. In how many days can B alone do the whole work?',
  ['10 days', '12 days', '14 days', '16 days'], 'B',
  'A did 4/12 = 1/3; remaining 2/3 done by B in 8 days → whole work = 8 × 3/2 = 12 days.');
push(TW, 'Two pipes can fill a tank in 6 hours and 9 hours respectively. If both are opened together, in how many hours will the tank be filled?',
  ['3.4 hours', '3.6 hours', '4 hours', '3.8 hours'], 'B',
  'Combined rate = 1/6 + 1/9 = 5/18 per hour → time = 18/5 = 3.6 hours.');
push(TW, 'A pipe can fill a tank in 8 hours, but a leak can empty the full tank in 24 hours. In how many hours will the tank be filled with the leak present?',
  ['10 hours', '11 hours', '12 hours', '14 hours'], 'C',
  'Net rate = 1/8 − 1/24 = 2/24 = 1/12 → 12 hours.');
push(TW, 'If 15 men can complete a work in 20 days, in how many days will 20 men complete the same work?',
  ['14 days', '15 days', '16 days', '18 days'], 'B',
  'M₁D₁ = M₂D₂ → 15 × 20 = 20 × D₂ → D₂ = 15 days.');
push(TW, 'A is three times as efficient as B. If B alone can do a work in 24 days, in how many days can A and B together complete it?',
  ['5 days', '6 days', '7 days', '8 days'], 'B',
  'A alone = 24/3 = 8 days. Together = (8 × 24)/(8 + 24) = 192/32 = 6 days.');

/* ─── Speed, Time & Distance (8) ─── */
const SD = 'Speed, Time & Distance';
push(SD, 'A car covers 60 km in 1.5 hours. What is its average speed?',
  ['40 km/h', '45 km/h', '50 km/h', '55 km/h'], 'A',
  'Speed = 60/1.5 = 40 km/h.');
push(SD, 'Convert 72 km/h into metres per second.',
  ['18 m/s', '20 m/s', '22 m/s', '24 m/s'], 'B',
  '72 × 5/18 = 20 m/s.');
push(SD, 'A train 150 m long is running at 54 km/h. In how much time will it pass a pole?',
  ['8 seconds', '10 seconds', '12 seconds', '15 seconds'], 'B',
  '54 km/h = 15 m/s. Time = 150/15 = 10 seconds.');
push(SD, 'A train 200 m long running at 90 km/h crosses a platform 300 m long. How much time does it take?',
  ['15 seconds', '18 seconds', '20 seconds', '24 seconds'], 'C',
  '90 km/h = 25 m/s. Total distance = 200 + 300 = 500 m → time = 500/25 = 20 seconds.');
push(SD, 'A car covers a distance in 4 hours at 45 km/h. If it returns over the same route at 36 km/h, how much time will the return journey take?',
  ['4.5 hours', '5 hours', '5.5 hours', '6 hours'], 'B',
  'Distance = 45 × 4 = 180 km. Return time = 180/36 = 5 hours.');
push(SD, 'Walking at 5/6 of his usual speed, a student reaches school 10 minutes late. What is his usual time?',
  ['40 minutes', '45 minutes', '50 minutes', '60 minutes'], 'C',
  'Usual time × (6/5 − 1) = 10 → usual time × 1/5 = 10 → 50 minutes.');
push(SD, 'A boat goes 12 km/h downstream and 8 km/h upstream. What is the speed of the stream?',
  ['1 km/h', '2 km/h', '3 km/h', '4 km/h'], 'B',
  'Stream speed = (12 − 8)/2 = 2 km/h (boat speed = 10 km/h).');
push(SD, 'Two trains of lengths 150 m and 250 m run on parallel tracks in opposite directions at 54 km/h and 36 km/h. In what time will they cross each other?',
  ['12 seconds', '14 seconds', '16 seconds', '18 seconds'], 'C',
  'Relative speed = 54 + 36 = 90 km/h = 25 m/s. Total length = 400 m → time = 400/25 = 16 seconds.');

/* ─── Number System (8) ─── */
const NU = 'Number System';
push(NU, 'What is the largest 4-digit number divisible by 12?',
  ['9990', '9996', '9998', '9984'], 'B',
  '9999 ÷ 12 gives remainder 3 — subtract 3: 9996 (12 × 833 = 9996).');
push(NU, 'What is the smallest number that must be added to 1050 so that the sum is divisible by 23?',
  ['3', '5', '8', '10'], 'C',
  '23 × 45 = 1035, remainder of 1050 ÷ 23 = 15 → add 23 − 15 = 8 (sum 1058 = 23 × 46).');
push(NU, 'What is the unit digit of 7¹⁰⁰?',
  ['1', '3', '7', '9'], 'A',
  'Unit digits of powers of 7 repeat in a cycle of 4: 7, 9, 3, 1. 100 ÷ 4 leaves remainder 0 → unit digit = 1.');
push(NU, 'What is the sum of the first 20 natural numbers?',
  ['190', '200', '210', '220'], 'C',
  'Sum = n(n+1)/2 = 20 × 21/2 = 210.');
push(NU, 'What is the LCM of 12, 15 and 20?',
  ['30', '45', '60', '120'], 'C',
  '12 = 2²×3, 15 = 3×5, 20 = 2²×5 → LCM = 2²×3×5 = 60.');
push(NU, 'What is the HCF of 84 and 126?',
  ['14', '21', '42', '63'], 'C',
  '84 = 2²×3×7, 126 = 2×3²×7 → HCF = 2×3×7 = 42.');
push(NU, 'How many prime numbers are there between 1 and 20?',
  ['7', '8', '9', '10'], 'B',
  'Primes: 2, 3, 5, 7, 11, 13, 17, 19 — total 8.');
push(NU, 'A number divided by 7 leaves a remainder 3. What will be the remainder when twice the number is divided by 7?',
  ['2', '4', '5', '6'], 'D',
  'n = 7k + 3 → 2n = 14k + 6 → remainder = 6.');

/* ─── Algebra (8) ─── */
const AL = 'Algebra';
push(AL, 'If x + 1/x = 5, what is the value of x² + 1/x²?',
  ['20', '23', '25', '27'], 'B',
  'x² + 1/x² = (x + 1/x)² − 2 = 25 − 2 = 23.');
push(AL, 'If 2x + 3y = 12 and x − y = 1, what is the value of x + y?',
  ['4', '5', '6', '7'], 'B',
  'From x = y + 1: 2(y+1) + 3y = 12 → 5y = 10 → y = 2, x = 3. x + y = 5.');
push(AL, 'If a − b = 4 and ab = 21, what is the value of a² + b²?',
  ['50', '54', '58', '62'], 'C',
  'a² + b² = (a − b)² + 2ab = 16 + 42 = 58.');
push(AL, 'If x + y = 6 and xy = 8, what is the value of x³ + y³?',
  ['64', '72', '80', '88'], 'B',
  'x³ + y³ = (x + y)³ − 3xy(x + y) = 216 − 144 = 72.');
push(AL, 'Solve for x: 5x − 3 = 2x + 9',
  ['2', '3', '4', '6'], 'C',
  '3x = 12 → x = 4.');
push(AL, 'What is the simplified value of (a + b)² − (a − b)²?',
  ['2ab', '4ab', 'a² + b²', '2a²'], 'B',
  '(a+b)² − (a−b)² = 4ab.');
push(AL, 'If x = 2 and y = 3, what is the value of x³ + y³?',
  ['27', '31', '35', '37'], 'C',
  'x³ + y³ = 8 + 27 = 35.');
push(AL, 'Which of the following is a factor of x² − 9?',
  ['x + 9', 'x − 1', 'x + 3', 'x − 9'], 'C',
  'x² − 9 = (x + 3)(x − 3) — so x + 3 is a factor.');

/* ─── Geometry (8) ─── */
const GE = 'Geometry';
push(GE, 'The angles of a triangle are in the ratio 3 : 4 : 5. What is the measure of the largest angle?',
  ['60°', '70°', '75°', '80°'], 'C',
  'Sum of ratio parts = 12; each part = 180/12 = 15°. Largest = 5 × 15 = 75°.');
push(GE, 'What is the sum of the interior angles of a pentagon?',
  ['360°', '450°', '540°', '720°'], 'C',
  '(n − 2) × 180° with n = 5 → 3 × 180° = 540°.');
push(GE, 'What is the measure of each angle of an equilateral triangle?',
  ['45°', '60°', '75°', '90°'], 'B',
  'All three angles are equal: 180°/3 = 60°.');
push(GE, 'What is the circumference of a circle whose radius is 7 cm? (π = 22/7)',
  ['44 cm', '40 cm', '48 cm', '154 cm'], 'A',
  'Circumference = 2πr = 2 × 22/7 × 7 = 44 cm.');
push(GE, 'What is the area of a triangle with base 10 cm and height 6 cm?',
  ['26 cm²', '30 cm²', '32 cm²', '60 cm²'], 'B',
  'Area = ½ × base × height = ½ × 10 × 6 = 30 cm².');
push(GE, 'What is the measure of an angle in a semicircle (angle subtended by a diameter at the circumference)?',
  ['45°', '60°', '90°', '180°'], 'C',
  'An angle in a semicircle is always a right angle (90°) — Thales\' theorem.');
push(GE, 'What is the length of the diagonal of a rectangle of sides 12 cm and 5 cm?',
  ['13 cm', '14 cm', '15 cm', '17 cm'], 'A',
  'Diagonal = √(12² + 5²) = √169 = 13 cm.');
push(GE, 'The sides of a triangle are 6 cm, 8 cm and 10 cm. What is its area?',
  ['24 cm²', '28 cm²', '30 cm²', '48 cm²'], 'A',
  '6² + 8² = 10², so it is right-angled. Area = ½ × 6 × 8 = 24 cm².');

/* ─── Mensuration (8) ─── */
const ME = 'Mensuration';
push(ME, 'The perimeter of a square is 40 cm. What is its area?',
  ['80 cm²', '100 cm²', '120 cm²', '160 cm²'], 'B',
  'Side = 40/4 = 10 cm; area = 10² = 100 cm².');
push(ME, 'What is the volume of a cube whose edge is 4 cm?',
  ['16 cm³', '48 cm³', '64 cm³', '81 cm³'], 'C',
  'Volume = a³ = 4³ = 64 cm³.');
push(ME, 'What is the curved surface area of a cylinder of radius 7 cm and height 10 cm? (π = 22/7)',
  ['220 cm²', '330 cm²', '440 cm²', '880 cm²'], 'C',
  'CSA = 2πrh = 2 × 22/7 × 7 × 10 = 440 cm².');
push(ME, 'What is the volume of a sphere of radius 3 cm (in terms of π)?',
  ['12π cm³', '27π cm³', '36π cm³', '108π cm³'], 'C',
  'Volume = (4/3)πr³ = (4/3)π × 27 = 36π cm³.');
push(ME, 'What is the length of the diagonal of a rectangle of 15 cm × 8 cm?',
  ['15 cm', '16 cm', '17 cm', '18 cm'], 'C',
  'Diagonal = √(15² + 8²) = √289 = 17 cm.');
push(ME, 'What is the perimeter of a semicircle of radius 7 cm? (π = 22/7)',
  ['29 cm', '33 cm', '36 cm', '44 cm'], 'C',
  'Perimeter = πr + 2r = 22 + 14 = 36 cm.');
push(ME, 'The total surface area of a cube is 216 cm². What is its volume?',
  ['196 cm³', '216 cm³', '256 cm³', '343 cm³'], 'B',
  '6a² = 216 → a = 6 cm; volume = 6³ = 216 cm³.');
push(ME, 'A rectangular field is 40 m long and 25 m wide. What will be the cost of fencing it at ₹12 per metre?',
  ['₹1,360', '₹1,460', '₹1,560', '₹1,660'], 'C',
  'Perimeter = 2(40 + 25) = 130 m; cost = 130 × 12 = ₹1,560.');

/* ─── Trigonometry (6) ─── */
const TR = 'Trigonometry';
push(TR, 'What is the value of sin 30° + cos 60°?',
  ['0.5', '1', '1.5', '2'], 'B',
  'sin 30° = ½ and cos 60° = ½ — sum = 1.');
push(TR, 'What is the value of tan 45°?',
  ['0', '½', '1', '√3'], 'C',
  'tan 45° = 1.');
push(TR, 'If sin θ = 3/5 (θ acute), what is the value of cos θ?',
  ['3/4', '4/5', '5/4', '4/3'], 'B',
  'cos θ = √(1 − 9/25) = √(16/25) = 4/5.');
push(TR, 'What is the value of sin² 30° + cos² 30°?',
  ['0', '½', '1', '2'], 'C',
  'By the identity sin²θ + cos²θ = 1, the value is 1 for any angle.');
push(TR, 'What is the value of sec² θ − tan² θ?',
  ['0', '1', '2', 'sin² θ'], 'B',
  'By the standard identity, sec² θ − tan² θ = 1.');
push(TR, 'If tan θ = 1 (θ acute), what is the value of θ?',
  ['30°', '45°', '60°', '90°'], 'B',
  'tan 45° = 1, so θ = 45°.');

const cnt = {};
for (const q of L) cnt[q.chapter] = (cnt[q.chapter] || 0) + 1;
console.error('MATH chapters:', JSON.stringify(cnt), 'total:', L.length);
build('mathematics', SN, L);
