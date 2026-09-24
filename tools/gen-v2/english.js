'use strict';
/* English — 100 Q (Fill blanks <u> 25, Error Spotting 15, Improvement 15,
   Synonyms 15, Antonyms 15, One Word 8, Idioms 7) — SSC CHSL pattern.
   questionTextHi = English copy BY DESIGN (hasDevanagari gate handles). */
const { Q, build } = require('./lib');
const SN = 'English Language';
const BLANK = '<u>&nbsp;&nbsp;&nbsp;&nbsp;</u>';
const L = [];

const FILL = 'Fill in the Blanks';
const fb = (q, opts, ans, exp) => L.push(Q('english', SN, FILL, 'Fill in the Blanks', q, opts, ans, exp));

fb(`She ${BLANK} to school every day.`, ['go', 'goes', 'going', 'gone'], 'B',
  'Simple present tense with third person singular (She) takes verb + s — "goes". Daily routine is expressed in simple present.');
fb(`I have been living in Delhi ${BLANK} 2015.`, ['since', 'for', 'from', 'at'], 'A',
  '"Since" is used with a point of time (2015) in perfect/present perfect continuous tenses. "For" is used with a period of time.');
fb(`He is ${BLANK} honest man.`, ['a', 'an', 'the', 'no article'], 'B',
  '"Honest" begins with a vowel SOUND (the \'h\' is silent), so the article "an" is used before it.');
fb(`The cat is hiding ${BLANK} the table.`, ['under', 'on', 'above', 'in'], 'A',
  '"Under" means below something — the cat is hiding below the table. "On/above" show higher positions.');
fb(`Neither of the boys ${BLANK} present in the class.`, ['was', 'were', 'are', 'have'], 'A',
  '"Neither of" takes a singular verb — "was". Subjects joined with neither...nor agree with the nearer one, but "neither of + plural noun" is singular.');
fb(`She is good ${BLANK} mathematics.`, ['at', 'in', 'on', 'with'], 'A',
  'The correct preposition after "good" for a skill/subject is "at" — good at mathematics. ("Good in" is a common Indian-English error.)');
fb(`I ${BLANK} my homework before he came.`, ['finish', 'had finished', 'have finished', 'finishes'], 'B',
  'An action completed before another past action takes past perfect tense — "had finished" (before "he came").');
fb(`The sun ${BLANK} in the east.`, ['rise', 'rises', 'rose', 'is rising'], 'B',
  'Universal truths take simple present tense; with third person singular subject (the sun) the verb takes -s — "rises".');
fb(`He has been ill ${BLANK} Monday.`, ['for', 'since', 'from', 'during'], 'B',
  '"Since" is used with a point of time (Monday) with perfect tenses. "For" would need a duration like "for two days".');
fb(`This is the boy ${BLANK} won the first prize.`, ['who', 'which', 'whom', 'whose'], 'A',
  '"Who" is used as a subject pronoun for persons in relative clauses — the boy who won. "Which" is for things, "whom" for objects.');
fb(`I am looking forward to ${BLANK} you soon.`, ['meet', 'meeting', 'met', 'be met'], 'B',
  '"Look forward to" is followed by a gerund (-ing form) — "looking forward to meeting". Here "to" is a preposition, not part of an infinitive.');
fb(`He prefers coffee ${BLANK} tea.`, ['to', 'than', 'from', 'with'], 'A',
  '"Prefer" is always followed by "to" (not "than") — prefer coffee to tea.');
fb(`If I ${BLANK} a bird, I would fly in the sky.`, ['am', 'was', 'were', 'be'], 'C',
  'In unreal/imaginary conditions (second conditional), "were" is used for all subjects — If I were a bird.');
fb(`The thief ${BLANK} before the police arrived.`, ['escape', 'escaped', 'had escaped', 'escapes'], 'C',
  'The earlier of two past actions takes past perfect — the thief "had escaped" before the police "arrived".');
fb(`She denied ${BLANK} the money.`, ['steal', 'to steal', 'stealing', 'stolen'], 'C',
  'The verb "deny" is followed by a gerund (-ing form) — denied stealing. Verbs like admit, enjoy, avoid also take gerunds.');
fb(`Hardly had he reached the station ${BLANK} the train left.`, ['when', 'than', 'then', 'while'], 'A',
  '"Hardly...when" is the correct correlative pair. "No sooner" pairs with "than", but "hardly" pairs with "when".');
fb(`One should keep ${BLANK} promises.`, ["one's", 'his', 'her', 'their'], 'A',
  'When the subject is "one", the corresponding possessive is "one\'s" — one should keep one\'s promises.');
fb(`The book ${BLANK} I bought yesterday is missing.`, ['who', 'which', 'what', 'whose'], 'B',
  '"Which" is the relative pronoun used for things — the book which I bought. "Who" is only for persons.');
fb(`He is senior ${BLANK} me by two years.`, ['to', 'than', 'from', 'over'], 'A',
  'Adjectives taken from Latin (senior, junior, superior, inferior, prior) are followed by "to", not "than".');
fb(`I would rather ${BLANK} at home than go out.`, ['stay', 'to stay', 'staying', 'stayed'], 'A',
  '"Would rather" is followed by the bare infinitive (first form without to) — would rather stay.');
fb(`The news ${BLANK} very good today.`, ['is', 'are', 'were', 'have'], 'A',
  '"News" is an uncountable noun that looks plural but takes a singular verb — the news is.');
fb(`He ${BLANK} here since morning.`, ['is waiting', 'has been waiting', 'waited', 'waits'], 'B',
  'An action that started in the past and continues till now (since morning) takes present perfect continuous — has been waiting.');
fb(`No sooner did he reach home ${BLANK} it started raining.`, ['than', 'when', 'then', 'that'], 'A',
  '"No sooner" is always paired with "than" — no sooner...than. "Hardly/scarcely" pair with "when".');
fb(`They have been married ${BLANK} ten years.`, ['for', 'since', 'from', 'during'], 'A',
  '"For" is used with a period of time (ten years); "since" is used with a starting point (2015).');
fb(`Each boy and each girl ${BLANK} given a certificate.`, ['was', 'were', 'are', 'have been'], 'A',
  'When a singular noun is repeated with "each" (each boy and each girl), the verb is singular — was given.');

/* ─── Error Spotting (15) ─── */
const ERR = 'Error Spotting';
const err = (parts, ans, exp) => L.push(Q('english', SN, ERR, 'Error Spotting',
  `Find the part of the sentence that contains an error: ${parts[0]} / ${parts[1]} / ${parts[2]} / ${parts[3]}`,
  parts, ans, exp));
err(['One of my friend', 'lives in Delhi', 'with his family', 'No error'], 'A',
  '"One of" is followed by a plural noun — one of my friends. "One of + plural noun + singular verb" is the correct structure.');
err(['He is more taller', 'than his brother', 'by two inches', 'No error'], 'A',
  'Double comparative is wrong — "more taller" should be only "taller" (or "much taller" for emphasis).');
err(['I met him', 'two years ago', 'in Mumbai', 'No error'], 'D',
  'The sentence is correct — simple past tense with a past time expression (two years ago) is properly used.');
err(['The Ganges', 'is one of the longest river', 'in India', 'No error'], 'B',
  '"One of the" is followed by a plural noun — one of the longest rivers.');
err(['She do not', 'know how to swim', 'in deep water', 'No error'], 'A',
  'Third person singular subject (she) takes "does not" in simple present — she does not know.');
err(['My father', 'is suffering', 'from fever since Monday', 'No error'], 'C',
  'An action continuing since a past point takes present perfect continuous — has been suffering from fever since Monday.');
err(['He asked me', 'that where', 'I was going', 'No error'], 'B',
  'In indirect (reported) questions, "that" is not used before the question word — He asked me where I was going.');
err(['Each of the students', 'have submitted', 'the assignment', 'No error'], 'B',
  '"Each of + plural noun" takes a singular verb — has submitted.');
err(['The scenery', 'of Kashmir', 'are beautiful', 'No error'], 'C',
  '"Scenery" is an uncountable noun and takes a singular verb — the scenery of Kashmir is beautiful.');
err(['I have read', 'this book', 'five years ago', 'No error'], 'A',
  'Present perfect tense cannot be used with a definite past time (ago) — use simple past: I read this book five years ago.');
err(['He is one of', 'the best player', 'in the team', 'No error'], 'B',
  '"One of the" is followed by a plural noun — the best players.');
err(['Neither Ram', 'nor his friends', 'was present', 'No error'], 'C',
  'In neither...nor, the verb agrees with the nearer subject (his friends — plural) — were present.');
err(['The Prime Minister', 'along with his ministers', 'were present at the function', 'No error'], 'C',
  '"Along with" does not change the number of the subject — The Prime Minister (singular) ... was present.');
err(['She has been', 'working here', 'for 2015', 'No error'], 'C',
  'A point of time takes "since", not "for" — working here since 2015.');
err(['He as well as', 'his parents', 'are going to Agra', 'No error'], 'C',
  '"As well as" does not change the number of the subject — He (singular) ... is going to Agra.');

/* ─── Sentence Improvement (15) ─── */
const IMP = 'Sentence Improvement';
const imp = (sentence, opts, ans, exp) => L.push(Q('english', SN, IMP, 'Sentence Improvement',
  `Improve the bracketed part of the sentence: ${sentence}`, opts, ans, exp));
imp("He (don't) know the answer.", ["don't", "doesn't", "didn't", 'No improvement'], 'B',
  'Third person singular subject (he) takes "doesn\'t" in simple present negative.');
imp('She is (more better) than her sister.', ['more good', 'better', 'best', 'No improvement'], 'B',
  'Double comparative is incorrect — the comparative of "good" is only "better".');
imp('I (have seen) him yesterday.', ['saw', 'seen', 'have saw', 'No improvement'], 'A',
  'With a definite past time word (yesterday) simple past tense is used — I saw him yesterday.');
imp('The cattle (is grazing) in the field.', ['are grazing', 'is graze', 'grazes', 'No improvement'], 'A',
  '"Cattle" is always a plural noun and takes a plural verb — cattle are grazing.');
imp('He (has been working) here since 2010.', ['is working', 'works', 'worked', 'No improvement'], 'D',
  'The sentence is correct — present perfect continuous (has been working) with "since" shows an action still going on.');
imp('One of my friends (have) gone abroad.', ['has', 'have been', 'are', 'No improvement'], 'A',
  '"One of + plural noun" takes a singular verb — one of my friends has gone.');
imp('He is (senior than) me by two years.', ['senior to', 'more senior than', 'senior from', 'No improvement'], 'A',
  'Latin comparatives (senior, junior, superior, inferior) take "to", not "than".');
imp('The teacher (gave us many advices).', ['gave us much advice', 'gave us some advices', 'gave advices to us', 'No improvement'], 'A',
  '"Advice" is uncountable — use much advice (or many pieces of advice), never "many advices".');
imp('This sum is (too difficult) for me to solve.', ['very difficult', 'so much difficult', 'much difficult', 'No improvement'], 'D',
  'The sentence is correct — "too + adjective + to + verb" shows excess and is properly used here.');
imp('I (prefers tea than) coffee.', ['prefer tea to', 'prefer tea than', 'am preferring tea to', 'No improvement'], 'A',
  '"Prefer" takes "to" after it, and with I the verb is "prefer" — prefer tea to coffee.');
imp('He (did not wrote) the letter.', ['did not write', 'did not written', 'does not wrote', 'No improvement'], 'A',
  'After the auxiliary "did" the base form of the verb is used — did not write.');
imp('The Ganga (is considered as) the holiest river of India.', ['is considered', 'is consider as', 'is being consider', 'No improvement'], 'A',
  '"Consider" is not followed by "as" in the active sense — is considered the holiest river.');
imp('Unless you (do not work) hard, you will fail.', ['work', 'does not work', 'did not work', 'No improvement'], 'A',
  '"Unless" itself carries a negative sense, so no double negative — unless you work hard.');
imp('She (is listening) music since morning.', ['has been listening to music', 'is listening to music', 'listens music', 'No improvement'], 'A',
  'An action continuing since morning takes present perfect continuous — has been listening to music ("listen" also takes "to").');
imp('He (returned back) from Mumbai last night.', ['returned', 'returns back', 'had return back', 'No improvement'], 'A',
  '"Return" itself means come back, so "back" is superfluous — he returned from Mumbai.');

/* ─── Synonyms (15) ─── */
const SYN = 'Synonyms';
const syn = (word, opts, ans, exp) => L.push(Q('english', SN, SYN, 'Synonyms',
  `Choose the word that is closest in meaning (synonym) to: ${word}`, opts, ans, exp));
syn('ABANDON', ['retain', 'forsake', 'gather', 'cherish'], 'B',
  'Abandon means to leave completely / give up — forsake. Retain and cherish are opposite in meaning.');
syn('ABUNDANT', ['scarce', 'plentiful', 'rare', 'little'], 'B',
  'Abundant means existing in large quantity — plentiful. Scarce and rare are antonyms.');
syn('BRIEF', ['long', 'short', 'detailed', 'wide'], 'B',
  'Brief means lasting or taking a short time — short. Long and detailed are antonyms.');
syn('CALAMITY', ['blessing', 'disaster', 'celebration', 'fortune'], 'B',
  'Calamity means a great misfortune or disaster — disaster.');
syn('DILIGENT', ['lazy', 'careless', 'hardworking', 'slow'], 'C',
  'Diligent means showing careful and persistent effort — hardworking. Lazy is the antonym.');
syn('ELATED', ['depressed', 'sad', 'overjoyed', 'tired'], 'C',
  'Elated means extremely happy — overjoyed. Depressed and sad are antonyms.');
syn('FRAGILE', ['strong', 'sturdy', 'delicate', 'solid'], 'C',
  'Fragile means easily broken — delicate. Strong, sturdy and solid are antonyms.');
syn('GENEROUS', ['stingy', 'liberal', 'greedy', 'miserly'], 'B',
  'Generous means willing to give freely — liberal. Stingy and miserly are antonyms.');
syn('HOSTILE', ['friendly', 'unfriendly', 'helpful', 'kind'], 'B',
  'Hostile means showing opposition or ill will — unfriendly. Friendly is the antonym.');
syn('IMMENSE', ['tiny', 'huge', 'narrow', 'slight'], 'B',
  'Immense means extremely large — huge. Tiny is the antonym.');
syn('LUCID', ['unclear', 'confused', 'clear', 'dark'], 'C',
  'Lucid means expressed clearly and easy to understand — clear.');
syn('OBSTINATE', ['stubborn', 'obedient', 'flexible', 'gentle'], 'A',
  'Obstinate means refusing to change one\'s opinion — stubborn. Obedient and flexible are antonyms.');
syn('PLACID', ['calm', 'violent', 'noisy', 'rough'], 'A',
  'Placid means calm and peaceful — calm. Violent and rough are antonyms.');
syn('RAPID', ['swift', 'slow', 'lazy', 'gradual'], 'A',
  'Rapid means happening quickly — swift. Slow and gradual are antonyms.');
syn('VIGILANT', ['careless', 'watchful', 'sleepy', 'blind'], 'B',
  'Vigilant means keeping careful watch — watchful. Careless is the antonym.');

/* ─── Antonyms (15) ─── */
const ANT = 'Antonyms';
const ant = (word, opts, ans, exp) => L.push(Q('english', SN, ANT, 'Antonyms',
  `Choose the word that is opposite in meaning (antonym) to: ${word}`, opts, ans, exp));
ant('ACCEPT', ['receive', 'reject', 'agree', 'adopt'], 'B',
  'Accept means to take or agree to something — its opposite is reject (to refuse).');
ant('ANCIENT', ['old', 'antique', 'modern', 'aged'], 'C',
  'Ancient means very old — its opposite is modern (of present times).');
ant('ARROGANT', ['proud', 'humble', 'haughty', 'proud-hearted'], 'B',
  'Arrogant means having an exaggerated sense of importance — its opposite is humble (modest).');
ant('BOLD', ['brave', 'timid', 'fearless', 'daring'], 'B',
  'Bold means confident and daring — its opposite is timid (shy, fearful).');
ant('CAUTIOUS', ['careful', 'wary', 'careless', 'alert'], 'C',
  'Cautious means careful to avoid danger — its opposite is careless.');
ant('DEFEAT', ['loss', 'victory', 'failure', 'fall'], 'B',
  'Defeat means losing a contest — its opposite is victory (winning).');
ant('EXPAND', ['enlarge', 'contract', 'spread', 'extend'], 'B',
  'Expand means to become larger — its opposite is contract (to become smaller).');
ant('FAMINE', ['hunger', 'abundance', 'drought', 'poverty'], 'B',
  'Famine means extreme scarcity of food — its opposite is abundance (plenty of food).');
ant('GENUINE', ['real', 'authentic', 'fake', 'actual'], 'C',
  'Genuine means real and original — its opposite is fake (counterfeit).');
ant('HUMID', ['wet', 'damp', 'dry', 'moist'], 'C',
  'Humid means having a lot of moisture — its opposite is dry.');
ant('INFERIOR', ['lower', 'superior', 'poor', 'weaker'], 'B',
  'Inferior means lower in quality or rank — its opposite is superior (higher).');
ant('LIBERTY', ['freedom', 'bondage', 'release', 'independence'], 'B',
  'Liberty means freedom — its opposite is bondage (slavery, captivity).');
ant('OPTIMIST', ['hopeful', 'pessimist', 'cheerful', 'positive'], 'B',
  'An optimist expects the best — its opposite is a pessimist (one who expects the worst).');
ant('SCARCITY', ['shortage', 'plenty', 'lack', 'deficit'], 'B',
  'Scarcity means insufficiency — its opposite is plenty (abundance).');
ant('TRANSPARENT', ['clear', 'opaque', 'limpid', 'sheer'], 'B',
  'Transparent allows light to pass through — its opposite is opaque (not allowing light through).');

/* ─── One Word Substitution (8) ─── */
const OWS = 'One Word Substitution';
L.push(Q('english', SN, OWS, 'One Word Substitution', 'Choose the one word for: One who cannot read or write.',
  ['Ignorant', 'Illiterate', 'Uneducated', 'Backward'], 'B',
  'One who cannot read or write is called illiterate. Ignorant means lacking knowledge in general.'));
L.push(Q('english', SN, OWS, 'One Word Substitution', 'Choose the one word for: One who loves mankind and works for the welfare of others.',
  ['Misanthrope', 'Philanthropist', 'Optimist', 'Humanist'], 'B',
  'A philanthropist loves mankind and donates/works for human welfare. A misanthrope hates mankind — the opposite.'));
L.push(Q('english', SN, OWS, 'One Word Substitution', 'Choose the one word for: A place where bees are kept.',
  ['Aviary', 'Apiary', 'Aquarium', 'Granary'], 'B',
  'An apiary is a place where bees are kept. Aviary is for birds, aquarium for fish and granary for grain.'));
L.push(Q('english', SN, OWS, 'One Word Substitution', 'Choose the one word for: A person who speaks many languages.',
  ['Linguist', 'Polyglot', 'Translator', 'Grammarian'], 'B',
  'A polyglot speaks many languages. A linguist studies the science of language; a translator converts text between languages.'));
L.push(Q('english', SN, OWS, 'One Word Substitution', 'Choose the one word for: Government by the people.',
  ['Monarchy', 'Democracy', 'Aristocracy', 'Bureaucracy'], 'B',
  'Government by the people (through elected representatives) is democracy. Monarchy is rule by a king/queen.'));
L.push(Q('english', SN, OWS, 'One Word Substitution', 'Choose the one word for: One who is present everywhere.',
  ['Omnipotent', 'Omnipresent', 'Omniscient', 'Omnivorous'], 'B',
  'Omnipresent means present everywhere. Omnipotent = all powerful, omniscient = all knowing.'));
L.push(Q('english', SN, OWS, 'One Word Substitution', 'Choose the one word for: A medicine that counteracts poison.',
  ['Antidote', 'Antibiotic', 'Vaccine', 'Sedative'], 'A',
  'An antidote counteracts the effect of poison. An antibiotic fights bacterial infections.'));
L.push(Q('english', SN, OWS, 'One Word Substitution', 'Choose the one word for: Fear of confined (closed) spaces.',
  ['Claustrophobia', 'Hydrophobia', 'Acrophobia', 'Xenophobia'], 'A',
  'Claustrophobia is the fear of closed/confined spaces. Hydrophobia = fear of water, acrophobia = fear of heights, xenophobia = fear of foreigners.'));

/* ─── Idioms & Phrases (7) ─── */
const IDIOM = 'Idioms & Phrases';
L.push(Q('english', SN, IDIOM, 'Idioms & Phrases', "Choose the correct meaning of the idiom: 'To break the ice'.",
  ['To damage something', 'To start a conversation in a social setting', 'To end a friendship', 'To feel very cold'], 'B',
  "'To break the ice' means to say or do something that relieves tension and starts a conversation among strangers."));
L.push(Q('english', SN, IDIOM, 'Idioms & Phrases', "Choose the correct meaning of the idiom: 'A bolt from the blue'.",
  ['A thunderstorm', 'A sudden and unexpected shock', 'A blue-coloured object', 'A slow and steady event'], 'B',
  "'A bolt from the blue' means a sudden, completely unexpected event or shock — usually unpleasant news."));
L.push(Q('english', SN, IDIOM, 'Idioms & Phrases', "Choose the correct meaning of the idiom: 'To hit the nail on the head'.",
  ['To hurt someone', 'To say exactly the right thing', 'To repair furniture', 'To work very hard'], 'B',
  "'To hit the nail on the head' means to describe a situation exactly or say precisely the right thing."));
L.push(Q('english', SN, IDIOM, 'Idioms & Phrases', "Choose the correct meaning of the idiom: 'To smell a rat'.",
  ['To find a bad smell', 'To suspect that something is wrong', 'To catch a thief', 'To feel hungry'], 'B',
  "'To smell a rat' means to suspect deceit or trickery — to feel that something is wrong."));
L.push(Q('english', SN, IDIOM, 'Idioms & Phrases', "Choose the correct meaning of the idiom: 'Once in a blue moon'.",
  ['Every month', 'Very rarely', 'Regularly', 'At night only'], 'B',
  "'Once in a blue moon' means something that happens very rarely."));
L.push(Q('english', SN, IDIOM, 'Idioms & Phrases', "Choose the correct meaning of the idiom: 'To burn the midnight oil'.",
  ['To waste fuel', 'To study or work late into the night', 'To set fire to something', 'To celebrate at night'], 'B',
  "'To burn the midnight oil' means to study or work late into the night."));
L.push(Q('english', SN, IDIOM, 'Idioms & Phrases', "Choose the correct meaning of the idiom: 'A white elephant'.",
  ['A rare animal', 'A costly but useless possession', 'A precious gift', 'A beautiful memory'], 'B',
  "'A white elephant' means a costly but troublesome or useless possession that is difficult to maintain."));

const cnt = {};
for (const q of L) cnt[q.chapter] = (cnt[q.chapter] || 0) + 1;
console.error('EN chapters:', JSON.stringify(cnt), 'total:', L.length);
build('english', SN, L);
