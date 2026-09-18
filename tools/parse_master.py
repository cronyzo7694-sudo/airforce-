#!/usr/bin/env python3
"""
Build-time parser: converts Agniveer Vayu master TXT question banks into
structured JSON for the CBT platform's seed data.

Supports the two source formats found in the master files:
  FORMAT A (keyed):     Qn. text / (A)..(D) options / Answer: X
  FORMAT B (User TXT):  Qn. text / option text lines each followed by "N."
  FORMAT C (inline):    English spot-the-error questions with options inline
                        ("No error. A B C D")

Also auto-classifies chapter/topic via keyword rules (tagged 'auto-chapter'
so the user knows it is derived, not from source).
"""
import re, json, hashlib, sys, os

UP = os.path.join(os.path.dirname(__file__), '..', '..', 'uploads')
OUT = os.path.join(os.path.dirname(__file__), '..', 'data')

FILES = [
    ('Master_Physics_All_Papers (1).txt', 'physics', 'Physics'),
    ('Master_Math_All_Papers.txt', 'mathematics', 'Mathematics'),
    ('Master_English_All_Papers.txt', 'english', 'English'),
    ('Master_RAGA_All_Papers.txt', 'raga', 'RAGA'),
]

PAPER_RE = re.compile(r'^PAPER\s+(\d+)\s*\|\s*GROUP\s+([XY]+)\s*\|\s*(.+?)\s*\|\s*Source:\s*(.+?)\s*$', re.M)
Q_RE = re.compile(r'^(Q\d+\.)\s*(.*)$')

def norm(s: str) -> str:
    return re.sub(r'\s+', ' ', s.strip().lower())

def h(*parts: str) -> str:
    return hashlib.sha1('\u241f'.join(parts).encode('utf-8')).hexdigest()

# ----------------------------------------------------------------------------
# Chapter / topic classification (ordered rules, first match wins)
# Each rule: (chapter, topic, [regex patterns])  -- searched against the
# normalized question text + options, case-insensitive.
# ----------------------------------------------------------------------------
PHYSICS_RULES = [
    ('Units, Measurement & Errors', 'Dimensional Analysis', [r'dimensional formula', r'dimension of', r'dimensions of', r'significant figure', r'vernier', r'screw gauge', r'least count', r'\bSI unit', r'unit of']),
    ('Kinematics', 'Motion in a Straight Line', [r'projectile', r'velocity.*(time|displacement)', r'displacement', r'acceleration.*(velocity|time)', r's = ut', r'v = u', r'body (is )?thrown', r'dropped from', r'retardation', r'speed.*metre', r'motion.*(uniform|non.?uniform)']),
    ('Kinematics', 'Graphs of Motion', [r'v-t graph', r'x-t graph', r'velocity.time graph', r'slope of.*graph']),
    ('Laws of Motion & Friction', "Newton's Laws", [r"newton'?s.*(law|first|second|third)", r'momentum', r'impulse', r'inertia', r'action.*(reaction)', r'force.*(constant|varies)', r'thrust', r'pseudo']),
    ('Laws of Motion & Friction', 'Friction', [r'friction', r'coefficient of friction', r'angle of repose', r'limiting friction']),
    ('Work, Energy & Power', 'Work, Energy & Power', [r'\bwork done', r'kinetic energy', r'potential energy', r'conservation of energy', r'\bpower\b', r'collison|collision', r'coefficient of restitution', r'elastic.*inelastic', r'energy stored', r'springs?', r'rebounds?']),
    ('Gravitation', 'Gravitation', [r'gravit', r'escape velocity', r'satellite', r'kepler', r'orbital', r'acceleration due to gravity', r'\bg = ', r'mass of (the )?earth', r'weight.*mass']),
    ('Rotational Motion', 'Rotational Motion', [r'moment of inertia', r'torque', r'angular (momentum|velocity|acceleration)', r'centre of mass|center of mass', r'radius of gyration', r'rotational', r'circular path', r'centripetal', r'centrifugal', r'banking of road', r'turning']),
    ('Properties of Matter', 'Elasticity', [r"young'?s modulus", r'elastic', r'stress', r'strain', r'stretched wire', r'bulk modulus', r'modulus of rigidity', r'poisson']),
    ('Properties of Matter', 'Fluid Mechanics', [r'surface tension', r'viscosity', r'bernoulli', r'reynolds', r'stokes', r'terminal velocity', r'buoyan', r'archimedes', r'pascal.*law', r'capillary', r'angle of contact', r'hydraulic']),
    ('Thermodynamics & KTG', 'Thermodynamics', [r'thermodynamic', r'carnot', r'isothermal', r'adiabatic', r'entropy', r'heat engine', r'efficiency.*(heat|engine)', r'first law', r'second law', r'zeroth law', r'third law', r'internal energy', r'latent heat', r'specific heat', r'calorimet']),
    ('Thermodynamics & KTG', 'Kinetic Theory of Gases', [r'rms speed|rms velocity', r'kinetic theory', r'mean free path', r'degrees of freedom', r'ideal gas', r'gas.*(law|equation)', r'avogadro', r'molar specific', r'van der waals']),
    ('Thermal Expansion & Heat Transfer', 'Thermal Expansion', [r'thermal expansion', r'coefficient of (linear|superficial|cubical)', r'anomalous.*water', r'expansion.*rod']),
    ('Thermal Expansion & Heat Transfer', 'Heat Transfer', [r'conduction', r'convection', r'radiation.*heat', r'thermal conductivity', r'newton.*law of cooling', r'law of cooling', r'black body', r'wien', r'stefan']),
    ('Oscillations', 'Simple Harmonic Motion', [r'simple harmonic', r'\bSHM\b', r'pendulum', r'oscillat', r'time period', r'damped', r'amplitude.*frequency', r'spring.*block']),
    ('Waves & Sound', 'Wave Motion', [r'\bwave', r'wavelength', r'frequency.*wavelength', r'wave number', r'propagation constant', r'transverse', r'longitudinal', r'speed of sound', r'sonic', r'doppler', r'beat', r'resonance', r'fundamental', r'harmonic', r'overtone', r'organ pipe', r'standing wave', r'stationary wave', r'superposition']),
    ('Electrostatics', 'Coulomb\'s Law & Electric Field', [r'electrostatic', r'coulomb', r'electric field', r'gauss', r'dipole', r'electric flux', r'charge.*(force|field)', r'point charge']),
    ('Electrostatics', 'Electric Potential & Capacitance', [r'electric potential', r'potential difference', r'capacitor', r'capacitance', r'dielectric', r'equipotential', r'van de graaff']),
    ('Current Electricity', 'Current Electricity', [r'current.*(flow|density)', r"ohm'?s law", r'resist', r'\bEMF\b', r'\bemf\b', r'internal resistance', r'cell\b', r'battery', r'kirch?off', r'wheatstone', r'meter bridge', r'potentiometer', r'ammeter', r'voltmeter', r'shunt', r'\bv-i\b', r'drift velocity', r'color code of resistance', r'colour code']),
    ('Magnetism & Moving Charges', 'Magnetic Effects of Current', [r'magnetic (field|force|moment|dipole|flux|induction)', r'\bb ?field\b', r'solenoid', r'toroid', r'biot', r'ampere.*(law|circuital)', r'cyclotron', r'moving coil', r'galvanometer', r'e/m of electron', r'charge.*(mass|magnitude).*ratio']),
    ('Magnetism & Moving Charges', 'Magnetism & Matter', [r'bar magnet', r'paramagnet', r'diamagnet', r'ferromagnet', r'curie', r'magnetic.*susceptibility', r'tangent law', r'magnetisation']),
    ('EMI & AC', 'Electromagnetic Induction', [r'faraday', r'lenz', r'inductance', r'\bEMI\b', r'motional emf', r'self.induct', r'mutual.induct', r'eddy current', r'alternating', r'\bAC\b', r'\bLCR\b', r'impedance', r'transformer', r'power factor', r'choke', r'resonant frequency', r'inductive reactance', r'capacitive reactance', r'rms current', r'rms voltage', r'wattless']),
    ('EMI & AC', 'Electromagnetic Waves', [r'electromagnetic wave', r'\bEM wave', r'displacement current', r'maxwell', r'radiation.*(spectrum|order)', r'microwave', r'x.?ray.*(electromagnetic|spectrum)']),
    ('Optics', 'Reflection & Mirrors', [r'plane mirror', r'concave', r'convex mirror', r'reflect', r'mirror.*image', r'number of images', r'inclined at.*(mirror)', r'magnification.*mirror']),
    ('Optics', 'Refraction & Lenses', [r'refract', r'\blens\b', r'lenses', r'focal length', r'snell', r'critical angle', r'total internal', r'\bpower of lens', r'prism', r'rainbow', r'dispersion', r'magnifying', r'telescope', r'microscope', r'combination of lens']),
    ('Optics', 'Wave Optics', [r'interference', r'diffraction', r'young.*double slit', r'fringe', r'polariz', r'polaris', r'brewster', r'coherent', r'malus', r'wavefront', r'huygens']),
    ('Optics', 'Optical Instruments', [r'telescope', r'microscope', r'spectrometer', r'photometer']),
    ('Modern Physics', 'Photoelectric Effect & Dual Nature', [r'photoelectric', r'photon', r'einstein.*photo', r'work function', r'de broglie', r'matter wave', r'dual nature', r'davisson', r'stopping potential']),
    ('Modern Physics', 'Atomic Models & Nuclei', [r'bohr', r'hydrogen spectrum', r'rydberg', r'energy level', r'nucleus', r'nuclear', r'radioact', r'half.life', r'binding energy', r'isotope', r'fission', r'fusion', r'mass defect', r'\balpha decay', r'\bbeta decay']),
    ('Modern Physics', 'Semiconductors & Electronics', [r'semiconductor', r'diode', r'transistor', r'logic gate', r'\bp-n\b', r'p-n junction', r'\bLED\b', r'zener', r'rectifier', r'amplifier', r'oscillator', r'boolean', r'\bNAND\b|\bNOR\b|\bNOT gate|\bAND gate|\bOR gate', r'doping', r'extrinsic', r'intrinsic.*semiconductor', r'modulation', r'demodulat', r'communication.*(wave|signal)']),
    ('Modern Physics', 'X-rays & Radioactivity', [r'x.?ray', r'radioactiv', r'gamma ray', r'alpha particle', r'beta particle']),
]

MATH_RULES = [
    ('Sets, Relations & Functions', 'Sets', [r'\bset[s]?\b.*(union|intersection|subset|element)', r'n\(', r'venn', r'subset', r'power set', r'universal set']),
    ('Sets, Relations & Functions', 'Relations & Functions', [r'relation.*(reflexive|symmetric|transitive|equivalence)', r'domain.*range', r'\bf:? ?\(?x', r'one.?one', r'onto', r'bijective', r'inverse function', r'composite']),
    ('Quadratic Equations & Complex Numbers', 'Quadratic Equations', [r'quadratic', r'roots of.*equation', r'discriminant', r'alpha.*beta.*root', r'sum of roots', r'product of roots', r'ax\^?2 \+ bx']),
    ('Quadratic Equations & Complex Numbers', 'Complex Numbers', [r'complex', r'\bi\^2\b', r'imaginary', r'conjugate', r'argand', r'modulus.*argument', r'cube root of unity', r'\biota\b']),
    ('Sequences & Series', 'Arithmetic Progression', [r'arithmetic progression', r'\bAP\b.*(term|sum)', r'nth term.*AP', r'common difference']),
    ('Sequences & Series', 'Geometric Progression', [r'geometric progression', r'\bGP\b.*(term|sum)', r'common ratio', r'infinite GP', r'geometric mean', r'arithmetic mean.*geometric']),
    ('Sequences & Series', 'Series', [r'sum of.*(series|first|natural)', r'series.*sum', r'harmonic', r'\bAM\b.*\bGM\b']),
    ('Permutations & Combinations', 'Permutations & Combinations', [r'permut', r'combinat', r'in how many ways', r'arrange', r'select.*(committee|team)', r'words can be formed', r'\bnPr\b', r'\bnCr\b', r'factorial']),
    ('Binomial Theorem', 'Binomial Theorem', [r'binomial', r'expansion of', r'middle term', r'term independent', r'coefficient of x', r'general term', r'\(1 \+ x\)^', r'\(a \+ b\)^']),
    ('Matrices & Determinants', 'Matrices', [r'matrix', r'matrices', r'\bA\b.*\bB\b.*(order|multiply)', r'transpose', r'singular matrix', r'symmetric matrix', r'identity matrix', r'adjoint']),
    ('Matrices & Determinants', 'Determinants', [r'determinant', r'\bA\b.*\bB\b.*(square|matrix)', r'\|A\|', r'minor.*cofactor', r'cramer', r'inverse of matrix', r'non.?singular']),
    ('Trigonometry', 'Trigonometric Ratios & Identities', [r'\bsin\b|\bcos\b|\btan\b|\bcot\b|\bsec\b|\bcosec\b', r'trigonometr', r'sin\^|cos\^|tan\^', r'cot ?\(.*tan', r'identit', r'sin 2|cos 2|tan 2']),
    ('Trigonometry', 'Inverse Trigonometric Functions', [r'sin\^-?1|cos\^-?1|tan\^-?1|cot\^-?1|sec\^-?1|cosec\^-?1', r'sin-?1|cos-?1|tan-?1', r'inverse trig', r'cot −1|tan−1', r'√']),
    ('Trigonometry', 'Heights & Distances', [r'angle of elevation', r'angle of depression', r'tower.*height', r'height.*tower', r'observer', r'pole.*shadow']),
    ('Trigonometry', 'Multiple Angle & Transformation Formulae', [r'sin\(.{1,12}\+.{1,12}\)', r'cos\(.{1,12}\+.{1,12}\)', r'sin\(.{1,12}-.{1,12}\)', r'2 sin.*cos', r'product.*sum']),
    ('Coordinate Geometry', 'Straight Lines', [r'straight line', r'slope', r'equation of line', r'intercept', r'parallel.*perpendicular.*line', r'collinear', r'distance between.*lines', r'angle between.*line']),
    ('Coordinate Geometry', 'Circles', [r'\bcircle\b', r'centre.*radius|center.*radius', r'chord', r'tangent.*circle', r'equation of circle', r'radius.*circle']),
    ('Coordinate Geometry', 'Conic Sections', [r'parabola', r'ellipse', r'hyperbola', r'eccentricity', r'focus.*directrix', r'latus rectum']),
    ('Coordinate Geometry', 'Distance & Section Formulae', [r'distance between.*point', r'section formula', r'centroid', r'area of triangle.*vertices', r'mid.?point', r'vertices']),
    ('Limits, Continuity & Differentiability', 'Limits', [r'\blim\b', r'limit', r'x →|x->|x → 0', r'left hand limit|right hand limit']),
    ('Limits, Continuity & Differentiability', 'Continuity & Differentiability', [r'continu', r'differentiab']),
    ('Differentiation & Applications', 'Differentiation', [r'differenti', r'derivative', r'd\/dx|dy\/dx', r'd2|d\^2', r'chain rule', r'\bf\'\(x', r'd/dx', r'dx2', r'Find dx2']),
    ('Differentiation & Applications', 'Applications of Derivatives', [r'maxima|minima', r'maximum.*minimum', r'rate of change', r'increasing|decreasing.*function', r'tangent.*normal', r'rolle', r'lagrange', r'mean value theorem', r'monotonic']),
    ('Integration', 'Indefinite Integration', [r'∫', r'integral', r'integrat', r'antiderivative', r'\bdx\b(?!.*dy)', r'√.*dx', r'ax \+ b.*dx']),
    ('Integration', 'Definite Integration & Area', [r'∫.{0,12}[0-9a-zπ].{0,20}[0-9a-zπ].*dx', r'definite integral', r'area under', r'area bounded', r'area of region', r'limit of sum']),
    ('Differential Equations', 'Differential Equations', [r'differential equation', r'dy\/dx.*equation', r'order.*(differential|degree)', r'homogeneous.*differential', r'variable separable', r'integrating factor']),
    ('Vectors & 3D Geometry', 'Vectors', [r'vector', r'dot product', r'cross product', r'scalar triple', r'vector triple', r'unit vector', r'\bî\b|\bĵ\b|\bk̂', r'position vector', r'magnitude of vector', r'component.*vector']),
    ('Vectors & 3D Geometry', 'Three-Dimensional Geometry', [r'direction cosine', r'direction ratio', r'plane.*line.*3d', r'angle between.*plane', r'shortest distance.*line', r'coplanar', r'3.?dimensional', r'3d']),
    ('Statistics', 'Statistics', [r'mean\b', r'median', r'mode\b', r'variance', r'standard deviation', r'quartile', r'range of data', r'frequency', r'cumulative', r'\bMD\b.*mean', r'mean deviation', r'3\(Median', r'k\(3Median']),
    ('Probability', 'Probability', [r'probability', r'dice', r'coin.*toss|toss.*coin', r'cards?', r'randomly.*(select|draw)', r'\bp\(', r'bayes', r'binomial.*(probabilit|distribution)', r'mutually exclusive', r'independent event']),
    ('Logarithms', 'Logarithms', [r'\blog\b', r'logarithm']),
    ('Number System & Simplification', 'Number System', [r'HCF|LCM|GCD', r'remainder', r'divisib', r'unit digit', r'number.*divided', r'smallest.*number', r'largest.*number', r'\bconsecutive\b']),
    ('Mensuration', 'Mensuration', [r'area of.*(circle|triangle|square|rectangle)', r'volume of', r'surface area', r'curved surface', r'cone', r'cylinder', r'sphere', r'hemisphere', r'cuboid']),
]

ENGLISH_RULES = [
    ('Reading Comprehension', 'Passage-Based Questions', [r'read the passage', r'passage given below', r'following passage', r'theme of the passage', r'title of the passage', r'context of the passage', r'based on the passage', r'passage and answer']),
    ('Cloze Test', 'Cloze Test', [r'cloze', r'blank[s]? .*(numbered|given below)', r'fill.*blank.*passage']),
    ('Vocabulary', 'Synonyms', [r'synonym', r'similar in meaning']),
    ('Vocabulary', 'Antonyms', [r'antonym', r'opposite in meaning', r'opposite meaning']),
    ('Vocabulary', 'One Word Substitution', [r'one word', r'single word']),
    ('Vocabulary', 'Fill in the Blanks (Vocabulary)', [r'fill in the blank', r'fill.*blank', r'choose the correct word', r'most appropriate word', r'suitable word', r'plural of', r'feminine of', r'masculine of']),
    ('Idioms & Phrases', 'Idioms & Phrases', [r'idiom', r'phrase', r"means\b.*(choose|select)", r'underlined expression', r'figure of speech']),
    ('Spelling', 'Correct Spelling', [r'spelling', r'spelt', r'spelt']),
    ('Grammar', 'Error Detection', [r'error', r'erroneous', r'spot the', r'no error']),
    ('Grammar', 'Sentence Improvement', [r'improve', r'improvement', r'better.*sentence', r'which.*phrase.*replace']),
    ('Grammar', 'Active & Passive Voice', [r'active/passive', r'passive/active', r'passive voice', r'active voice']),
    ('Grammar', 'Direct & Indirect Speech', [r'direct/indirect', r'indirect speech', r'direct speech', r'reported speech', r'quotation.*sentence']),
    ('Grammar', 'Sentence Completion & Structure', [r'complete the sentence', r'sentence.*(complete|arrange)', r'most appropriate.*sentence', r'rearrange', r'jumbl', r'order.*sentences', r'correct sentence']),
    ('Grammar', 'Articles & Prepositions', [r'article', r'preposition']),
    ('Grammar', 'Tenses & Verbs', [r'tense', r'verb']),
    ('Vocabulary', 'General Vocabulary', [r'word', r'italicized', r'underlined word']),
]

RAGA_RULES = [
    ('Reasoning', 'Coding-Decoding', [r'code', r'coding', r'decoded', r'coded as']),
    ('Reasoning', 'Figure-Based Questions', [r'figure', r'figure-based']),
    ('Reasoning', 'Number & Alphabet Series', [r'series', r'missing (term|number|letter)', r'wrong number', r'next.*term', r'\?\s*$.*series']),
    ('Reasoning', 'Analogy', [r'analogy', r'is to', r'same way', r'relates to']),
    ('Reasoning', 'Blood Relations', [r'son of', r'daughter of', r'father', r'mother', r'brother', r'sister', r'wife of', r'husband of', r'uncle', r'aunt', r'grandfather', r'grandmother', r'how is .* related']),
    ('Reasoning', 'Direction Sense', [r'north', r'south', r'east', r'west', r'left.*turned', r'right.*turned', r'walking.*(direction|distance)', r'facing']),
    ('Reasoning', 'Syllogism', [r'syllogism', r'statements? (are|is)', r'conclusions follow', r'follows from the statement']),
    ('Reasoning', 'Seating Arrangement & Puzzles', [r'sitting', r'seat', r'row.*(person|people|girls|boys)', r'facing (each other|north|south)', r'arrangement']),
    ('Reasoning', 'Order & Ranking', [r'rank', r'tallest|shortest', r'heaviest|lightest', r'position from', r'how many.*between']),
    ('Reasoning', 'Counting Figures', [r'how many (triangles|squares|rectangles|circles|lines)', r'count.*figure']),
    ('Reasoning', 'Mirror & Water Images', [r'mirror image', r'water image', r'reflection of.*figure']),
    ('Reasoning', 'Venn Diagrams', [r'venn']),
    ('Reasoning', 'Dice & Cubes', [r'dice', r'cube.*(painted|folded)', r'unfolded']),
    ('Reasoning', 'Calendar', [r'calendar', r'day.*(week|date)', r'leap year', r'which day']),
    ('Reasoning', 'Clock', [r'clock', r'angle between.*hands', r'hands of clock']),
    ('Reasoning', 'Mathematical Operations', [r'solve.*equation', r'interchange.*(sign|number)', r'bodmas']),
    ('Reasoning', 'Statement & Conclusion', [r'statement', r'assumption', r'inference', r'conclusion']),
    ('General Knowledge', 'History', [r'history', r'dynasty', r'\bking\b', r'emperor', r'battle of', r'freedom struggle', r'mughal', r'maurya', r'quit india', r'congress', r'independence', r'british.*india', r'gandhi', r'ashoka', r'harappan', r'vedic', r'sultanate', r'revolt of 1857', r'jallianwala', r'shivaji', r'akbar', r'first.*war']),
    ('General Knowledge', 'Geography', [r'river', r'mountain', r'plateau', r'climate', r'soil', r'ocean', r'continent', r'national park', r'sanctuary', r'state of india', r'capital of', r'glacier', r'lake', r'island', r'delta', r'desert', r'pass', r'boundary', r'ghat', r'equator', r'hemisphere', r'latitude', r'longitude', r'monsoon', r'biosphere']),
    ('General Knowledge', 'Polity & Constitution', [r'constitution', r'president', r'parliament', r'amendment', r'fundamental', r'lok sabha', r'rajya sabha', r'governor', r'chief minister|prime minister', r'supreme court', r'high court', r'panchayat', r'vidhan', r'election commissioner', r'cag', r'attorney general', r'speaker', r'article']),
    ('General Knowledge', 'Economy', [r'\bGDP\b', r'budget', r'\bRBI\b', r'repo', r'inflation', r'\btax\b', r'five year plan', r'planning commission', r'nee?ti aayog', r'disinvestment', r'subsidy', r'\bfiscal\b', r'deficit', r'\bbank\b', r'currency.*note', r'gst', r'sensex', r'national income', r'per capita']),
    ('General Knowledge', 'General Science', [r'vitamin', r'chemical', r'\bgas\b', r'disease', r'plant', r'animal', r'\bcell\b', r'\bhormone\b', r'protein', r'\bblood\b', r'\bheart\b', r'\bbrain\b', r'bone', r'\bacid\b', r'\bbase\b', r'metal', r'non.?metal', r'electricity.*gk', r'invent', r'discover', r'\bSI\b unit', r'sound.*travel', r'light.*travel', r'photosynthesis', r'deficiency']),
    ('General Knowledge', 'Space & Defence', [r'\bISRO\b', r'\bNASA\b', r'satellite.*launched', r'missile', r'aircraft', r'\bIAF\b', r'air force', r'army', r'navy', r'military', r'fighter', r'\bDRDO\b', r'astronaut', r'chandrayaan', r'mangalyaan', r'\bGSLV\b|\bPSLV\b', r'rangoli.*defence|defence.*exercise', r'operation']),
    ('General Knowledge', 'Sports', [r'cricket', r'olympic', r'\bFIFA\b', r'hockey', r'\bIPL\b', r'trophy', r'\bwimbledon\b', r'\bworld cup\b', r'player', r'athlete', r'badminton', r'chess', r'tennis', r'kabaddi', r'\bkhelo\b']),
    ('General Knowledge', 'Art, Culture & Books', [r'dance', r'music', r'festival', r'book', r'authored', r'author', r'novel', r'painting', r'language', r'literature', r'film', r'award', r'bharat ratna', r'\bnobel\b', r'oscars?']),
    ('General Knowledge', 'Static GK & Current Affairs', [r'first.*(india|world)', r'largest|longest|highest|biggest|smallest', r'recently', r'appointed', r'\b20[12]\d\b.*(launch|held|started)', r'headquarters', r'\bUN\b', r'organisation', r'organization', r'summit', r'agreement', r'scheme', r'yojana', r'mission']),
]

SUBJECT_RULES = {
    'physics': PHYSICS_RULES,
    'mathematics': MATH_RULES,
    'english': ENGLISH_RULES,
    'raga': RAGA_RULES,
}
FALLBACK_CHAPTER = {
    'physics': 'Physics (Miscellaneous)',
    'mathematics': 'Mathematics (Miscellaneous)',
    'english': 'English (Miscellaneous)',
    'raga': 'Reasoning' if False else 'General Knowledge',
}

def classify(subject, text):
    hay = norm(text)
    rules = SUBJECT_RULES[subject]
    for chapter, topic, pats in rules:
        for p in pats:
            if re.search(p, hay, re.I):
                return chapter, topic
    if subject == 'raga':
        # RAGA default split: reasoning-ish stems vs GK
        if re.search(r'\?|series|analogy|code|figure', hay):
            return 'Reasoning', 'Reasoning (General)'
        return 'General Knowledge', 'Static GK & Current Affairs'
    return FALLBACK_CHAPTER[subject], 'General'


def parse_file(path, subject, subject_name):
    raw = open(path, encoding='utf-8').read()
    # papers: list of (paperNo, group, date, source, span)
    papers = []
    for m in PAPER_RE.finditer(raw):
        papers.append({'no': int(m.group(1)), 'group': m.group(2), 'date': m.group(3).strip(),
                       'source': m.group(4).strip(), 'start': m.end(), 'hdr_start': m.start(), 'end': None})
    for i, p in enumerate(papers):
        p['end'] = papers[i+1]['hdr_start'] if i+1 < len(papers) else len(raw)

    questions, stats = [], {'total': 0, 'keyed': 0, 'unkeyed': 0, 'invalid': 0, 'formatA': 0, 'formatB': 0, 'formatC': 0, 'formatD': 0, 'figure': 0}
    for p in papers:
        body = raw[p['start']:p['end']]
        # split into question blocks
        starts = [m.start() for m in re.finditer(r'(?m)^Q\d+\.', body)]
        if not starts:
            continue
        for j, s in enumerate(starts):
            block = body[s:starts[j+1] if j+1 < len(starts) else len(body)]
            q = parse_block(block, p, subject, subject_name, stats)
            if q:
                questions.append(q)
    return questions, stats


TRAIL_PHRASES = ['None of these', 'None of the above', 'All of the above', 'No error', 'None of the above.']

def _ngram_candidates(low_tail, n):
    """n-grams that occur exactly 3 times (word-aligned), first occurrence at pos 0."""
    words = low_tail.split()
    if len(words) < 3 * n:
        return []
    grams = {}
    for i in range(len(words) - n + 1):
        g = ' '.join(words[i:i+n])
        grams.setdefault(g, []).append(i)
    out = []
    for g, idxs in grams.items():
        if len(idxs) == 3 and idxs[0] == 0 and len(set(idxs)) == 3:
            out.append((g, idxs))
    return out


def _split_tail3(tail, opt1=''):
    """Split a concatenated 3-option tail (Prepp garble) into 3 options.
    Only high-confidence strategies; returns None when ambiguous."""
    if not tail:
        return None
    toks = tail.split()
    if len(toks) == 3:
        return toks
    for ph in TRAIL_PHRASES:
        if tail.endswith(ph):
            rem = tail[:-len(ph)].strip().rstrip('.').strip()
            t2 = rem.split()
            if len(t2) == 2:
                return t2 + [ph]
            p2 = [p.strip() for p in rem.split('. ') if p.strip()]
            if len(p2) == 2:
                return p2 + [ph]
            break
    parts = [p.strip() for p in tail.split('. ') if p.strip()]
    if len(parts) == 3:
        return [p if p.endswith('.') else p + '.' for p in parts]
    # repeated n-gram at the start of each option (1-, 2-, 3-grams)
    low = tail.lower()
    word_positions = None
    best = None
    words = low.split()
    opt1_first = (opt1.split()[0].lower().strip('.,') if opt1.split() else '')
    for n in (2, 3, 1):
        for g, idxs in _ngram_candidates(low, n):
            # word indices -> char offsets
            offs = []
            pos = 0
            wi = 0
            word_spans = []
            for w in words:
                word_spans.append((wi, pos, pos + len(w)))
                pos += len(w) + 1
                wi += 1
            offs = [word_spans[i][1] for i in idxs]
            if offs[0] != 0:
                continue
            segs = [tail[offs[0]:offs[1]].strip(), tail[offs[1]:offs[2]].strip(), tail[offs[2]:].strip()]
            if not all(len(s.split()) >= 2 for s in segs):
                continue
            wc = [len(s.split()) for s in segs]
            balanced = max(wc) / max(min(wc), 1) <= 2.5
            first_match = opt1_first and all(s.split()[0].lower().strip('.,') == opt1_first for s in segs)
            score = (2 if first_match else 0) + (1 if balanced else 0)
            if best is None or score > best[0]:
                best = (score, segs)
        if best and best[0] >= 2:
            return best[1]
    if best and best[0] >= 1:
        # only accept a low-confidence split when segments are balanced
        # AND no better evidence exists AND opt1 hint is unavailable
        return best[1] if not opt1_first else None
    return None


def _make(paper, subject, subject_name, qtext, opts, answer):
    """Build the canonical question dict."""
    hasKey = bool(answer) and re.fullmatch(r'[A-D]', answer or '') is not None
    ym = re.search(r'\b(19|20)\d{2}\b', paper['date'])
    year = int(ym.group(0)) if ym else 'Model'
    full_text = qtext + ' ' + ' '.join(opts)
    chapter, topic = classify(subject, full_text)
    return {
        'id': 'q_' + h(subject, qtext, ' | '.join(opts), answer or '?')[:16],
        'subject': subject, 'subjectName': subject_name,
        'chapter': chapter, 'topic': topic, 'difficulty': 'medium',
        'questionText': qtext,
        'image': None,
        'options': [{'id': L, 'text': opts[i]} for i, L in enumerate('ABCD')],
        'correctAnswer': answer if hasKey else None,
        'explanation': '',
        'source': f"PYQ · {paper['date']} · {paper['source']} (Group {paper['group']})",
        'year': year,
        'tags': ['pyq', 'group-' + paper['group'].lower(), 'auto-chapter', 'auto-topic'],
        'dupeHash': h(subject, qtext, ' | '.join(opts))[:16],
        'paper': {'no': paper['no'], 'group': paper['group'], 'date': paper['date'], 'src': paper['source']},
    }


def parse_block(block, paper, subject, subject_name, stats):
    stats['total'] += 1
    lines = block.split('\n')
    m = Q_RE.match(lines[0])
    qnum = int(m.group(1)[1:-1])
    first = m.group(2)
    rest = lines[1:]

    # --- figure-based question (options were figures in the source) ---
    if '(Options are figure-based in the source)' in block:
        junk = lambda t: (t.startswith('Answer:') or t == '(Options are figure-based in the source)'
                           or re.fullmatch(r'[=\-]+', t) or PAPER_RE.match(t))
        note_stripped = [ln.strip() for ln in rest if ln.strip() and not junk(ln.strip())]
        qtext = ' '.join([first] + note_stripped)
        qtext = re.sub(r'\s+', ' ', qtext).strip()
        ans = re.search(r'Answer:\s*([A-D])', block)
        stats['figure'] = stats.get('figure', 0) + 1
        q = _make(paper, subject, subject_name, qtext + ' (Options are figure-based in the source)',
                  [f'Figure {L} (see source)' for L in 'ABCD'], ans.group(1) if ans else None)
        q['figureBased'] = True
        q['tags'] = [t for t in q['tags'] if t != 'auto-topic'] + ['figure-based']
        return q

    fmtA_opts = {}
    answer = None
    cur = None
    qtext_lines = [first] if first else []
    mode = 'qtext'
    fmt = None

    for ln in rest:
        stripped = ln.strip()
        ma = re.match(r'^\(([A-D])\)\s*(.*)$', stripped)
        mb = re.match(r'^([1-4])\.\s*$', stripped)          # bare marker (fmt B)
        md = re.match(r'^([1-4])\.\s+(.+)$', stripped)      # marker-then-text (fmt D)
        mAns = re.match(r'^Answer:\s*(.+?)\s*$', stripped)
        if ma and fmt not in ('B', 'D'):
            fmt = 'A'; mode = 'opt'
            cur = [ma.group(2)]
            fmtA_opts[ma.group(1)] = cur
        elif md and fmt != 'A':
            fmt = 'D'; mode = 'opt'
            cur = [md.group(2)]
            fmtA_opts['ABCD'[int(md.group(1)) - 1]] = cur
        elif mb and fmt != 'A':
            fmt = 'B'; mode = 'opt'
            cur = None
        elif mAns:
            answer = mAns.group(1).strip()
            mode = 'done'
        else:
            if stripped == '' and mode == 'qtext':
                continue
            if fmt == 'A' or fmt == 'D':
                if mode == 'opt' and cur is not None:
                    cur.append(stripped)
                elif mode == 'qtext':
                    qtext_lines.append(stripped)
            elif fmt == 'B':
                qtext_lines.append(stripped)
            else:
                qtext_lines.append(stripped)

    qtext = ' '.join(t for t in (s.strip() for s in qtext_lines) if t)
    qtext = re.sub(r'\s+', ' ', qtext).strip()

    if fmt in ('A', 'D'):
        stats['formatA' if fmt == 'A' else 'formatD'] += 1
        if not all(k in fmtA_opts for k in 'ABCD'):
            stats['invalid'] += 1
            return None
        opts = [re.sub(r'\s+', ' ', ' '.join(fmtA_opts.get(k, ['']))).strip() for k in 'ABCD']
        # strip an answer key glued onto an option ("(D) Answer: D")
        for i, o in enumerate(opts):
            gm = re.match(r'^Answer:\s*([A-D?]+)\s*$', o)
            if gm:
                opts[i] = ''
                if answer is None:
                    answer = gm.group(1)

        # ---- garble pattern 1: all options empty -> options were figures ----
        if not any(opts):
            if not qtext:
                stats['invalid'] += 1
                return None
            stats['figure'] = stats.get('figure', 0) + 1
            q = _make(paper, subject, subject_name, qtext + ' (Options are figure-based in the source)',
                      [f'Figure {L} (see source)' for L in 'ABCD'], answer)
            q['figureBased'] = True
            q['tags'] = [t for t in q['tags'] if t != 'auto-topic'] + ['figure-based']
            return q

        # ---- garble pattern 2: Prepp 2021 passage Qs: (A)/(D) empty,
        # stem contains the real stem + opt1 + inline "1. 2. 3. 4." + opts 2-4,
        # (B) holds the real stem, (C) holds option 1 ----
        if (not opts[0] and not opts[3] and opts[1] and opts[2]
                and opts[1] not in ('1.', '2.', '3.', '4.') and opts[2] not in ('1.', '2.', '3.', '4.')
                and re.search(r'1\. 2\. 3\. 4\.', qtext)):
            m2 = re.match(r'^(.*?)\s*1\. 2\. 3\. 4\.\s*(.*)$', qtext)
            if m2:
                stem2, tail = m2.group(1).strip(), m2.group(2).strip()
                parts = _split_tail3(tail, opts[2])
                if parts and stem2.startswith(opts[1]) and stem2.endswith(opts[2]):
                    stats['recovered'] = stats.get('recovered', 0) + 1
                    q = _make(paper, subject, subject_name, opts[1], [opts[2]] + parts, answer)
                    q['tags'].append('auto-reconstructed')
                    return q
            stats['invalid'] += 1
            return None

        if len([o for o in opts if o]) < 4 or not qtext:
            stats['invalid'] += 1
            return None
    elif fmt == 'B':
        stats['formatB'] += 1
        segs = []
        for ln in rest:
            s2 = ln.strip()
            if re.match(r'^([1-4])\.\s*$', s2):
                segs.append(('m', s2))
            elif s2 == '':
                continue
            else:
                segs.append(('t', s2))
        # text segments before the FIRST marker = [first, qtext lines..., opt1]
        pre_all = [first]
        for kind, val in segs:
            if kind == 'm':
                break
            pre_all.append(val)
        if len(pre_all) < 2:
            stats['invalid'] += 1
            return None
        qtext = re.sub(r'\s+', ' ', ' '.join(pre_all[:-1])).strip()
        opt1 = pre_all[-1]
        # options 2..4 = text buffers between consecutive markers
        opts = [opt1]
        buf = []
        seen_markers = 0
        for kind, val in segs:
            if kind == 't':
                buf.append(val)
            else:
                seen_markers += 1
                if seen_markers == 1:
                    buf = []  # discard (that was opt1 territory already captured)
                else:
                    if buf:
                        opts.append(' '.join(buf))
                    buf = []
        opts = opts[:4]
    else:
        # FORMAT C: inline options (English spot-the-error)
        stats['formatC'] += 1
        if re.search(r'No error\.? A B C D$', qtext):
            qtext = re.sub(r'\s*No error\.? A B C D\s*$', '', qtext) + ' (Options: A / B / C / No Error)'
            opts = ['A', 'B', 'C', 'No Error']
        else:
            stats['invalid'] += 1
            return None

    # validate
    if not qtext or len([o for o in opts if o]) < 4:
        stats['invalid'] += 1
        return None
    hasKey = bool(answer) and re.fullmatch(r'[A-D]', answer or '') is not None
    if answer and not hasKey:
        answer = None  # 'Answer: ?' etc.

    return _make(paper, subject, subject_name, qtext, opts, answer)


def main():
    os.makedirs(OUT, exist_ok=True)
    grand = {}
    all_q = []
    for fname, subject, sname in FILES:
        path = os.path.join(UP, fname)
        qs, stats = parse_file(path, subject, sname)
        # dedupe within file: by id (exact) and by dupeHash (text-level)
        seen_ids, seen_dupes, final = set(), set(), []
        dups = 0
        for q in qs:
            if q['id'] in seen_ids:
                dups += 1
                continue
            prev = next((x for x in final if x['dupeHash'] == q['dupeHash']), None)
            if prev is not None:
                dups += 1
                # prefer keyed
                if prev['correctAnswer'] is None and q['correctAnswer']:
                    final[final.index(prev)] = q
                continue
            seen_ids.add(q['id'])
            final.append(q)
        keyed = sum(1 for q in final if q['correctAnswer'])
        fig = sum(1 for q in final if q.get('figureBased'))
        print(f"[{subject}] parsed={stats['total']} A={stats['formatA']} B={stats['formatB']} "
              f"C={stats['formatC']} D={stats['formatD']} fig={stats['figure']} recovered={stats.get('recovered', 0)} "
              f"invalid={stats['invalid']} dupes={dups} final={len(final)} keyed={keyed} figureBased={fig}")
        with open(os.path.join(OUT, f'bank-{subject}.json'), 'w', encoding='utf-8') as f:
            json.dump(final, f, ensure_ascii=False, separators=(',', ':'))
        grand[subject] = {'total': len(final), 'keyed': keyed, 'chapters': {}}
        for q in final:
            grand[subject]['chapters'][q['chapter']] = grand[subject]['chapters'].get(q['chapter'], 0) + 1
        all_q += final
    with open(os.path.join(OUT, 'bank-meta.json'), 'w', encoding='utf-8') as f:
        json.dump(grand, f, ensure_ascii=False, indent=1)
    print(f"TOTAL questions: {len(all_q)}  (keyed: {sum(1 for q in all_q if q['correctAnswer'])})")

if __name__ == '__main__':
    main()
