import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function generateSlug(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeInstitutionName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ==============================================================================
// 1. CANONICAL EDUCATIONS (25)
// Matches product spec and existing records exactly
// ==============================================================================
const EDUCATIONS = [
  { name: "10th", slug: "10th", sortOrder: 1 },
  { name: "12th", slug: "12th", sortOrder: 2 },
  { name: "Diploma", slug: "diploma", sortOrder: 3 },
  { name: "B.A.", slug: "ba", sortOrder: 4 },
  { name: "B.Sc.", slug: "bsc", sortOrder: 5 },
  { name: "B.Com.", slug: "bcom", sortOrder: 6 },
  { name: "BBA", slug: "bba", sortOrder: 7 },
  { name: "BCA", slug: "bca", sortOrder: 8 },
  { name: "B.E.", slug: "be", sortOrder: 9 },
  { name: "B.Tech.", slug: "btech", sortOrder: 10 },
  { name: "M.A.", slug: "ma", sortOrder: 11 },
  { name: "M.Sc.", slug: "msc", sortOrder: 12 },
  { name: "M.Com.", slug: "mcom", sortOrder: 13 },
  { name: "MBA", slug: "mba", sortOrder: 14 },
  { name: "MCA", slug: "mca", sortOrder: 15 },
  { name: "M.E.", slug: "me", sortOrder: 16 },
  { name: "M.Tech.", slug: "mtech", sortOrder: 17 },
  { name: "MBBS", slug: "mbbs", sortOrder: 18 },
  { name: "BDS", slug: "bds", sortOrder: 19 },
  { name: "LLB", slug: "llb", sortOrder: 20 },
  { name: "LLM", slug: "llm", sortOrder: 21 },
  { name: "CA", slug: "ca", sortOrder: 22 },
  { name: "CS", slug: "cs", sortOrder: 23 },
  { name: "PhD", slug: "phd", sortOrder: 24 },
  { name: "Other", slug: "other", sortOrder: 25 },
];

// ==============================================================================
// 2. CANONICAL EMPLOYMENT STATUSES (10)
// Matches product spec and existing records exactly
// ==============================================================================
const EMPLOYMENT_STATUSES = [
  { name: "Employed", slug: "employed", sortOrder: 1 },
  { name: "Self Employed", slug: "self-employed", sortOrder: 2 },
  { name: "Business Owner", slug: "business-owner", sortOrder: 3 },
  { name: "Entrepreneur", slug: "entrepreneur", sortOrder: 4 },
  { name: "Government Employee", slug: "government-employee", sortOrder: 5 },
  { name: "Defence", slug: "defence", sortOrder: 6 },
  { name: "Student", slug: "student", sortOrder: 7 },
  { name: "Not Working", slug: "not-working", sortOrder: 8 },
  { name: "Retired", slug: "retired", sortOrder: 9 },
  { name: "Other", slug: "other", sortOrder: 10 },
];

// ==============================================================================
// 3. SPECIALIZATIONS BY EDUCATION SLUG
// Dependent master data relationship: Education -> Specialization
// Unique constraint: @@unique([educationId, slug])
// ==============================================================================
const SPECIALIZATIONS_BY_EDUCATION: Record<string, string[]> = {
  "btech": [
    "Computer Science & Engineering",
    "Information Technology",
    "Electronics & Communication Engineering",
    "Electrical & Electronics Engineering",
    "Mechanical Engineering",
    "Civil Engineering",
    "Chemical Engineering",
    "Aerospace / Aeronautical Engineering",
    "Biotechnology / Biochemical Engineering",
    "Artificial Intelligence & Data Science",
    "Electronics & Instrumentation Engineering",
    "Industrial & Production Engineering",
    "Metallurgical & Materials Engineering",
    "Automobile Engineering",
    "Environmental Engineering",
    "Petroleum Engineering",
    "Agricultural Engineering",
    "Other",
  ],
  "be": [
    "Computer Engineering",
    "Information Technology",
    "Electronics & Telecommunication",
    "Electrical Engineering",
    "Mechanical Engineering",
    "Civil Engineering",
    "Chemical Engineering",
    "Instrumentation & Control",
    "Production Engineering",
    "Aeronautical Engineering",
    "Biomedical Engineering",
    "Mining Engineering",
    "Other",
  ],
  "mtech": [
    "Computer Science & Engineering",
    "Information Technology",
    "VLSI Design & Embedded Systems",
    "Communication Systems / Signal Processing",
    "Power Systems & Power Electronics",
    "Thermal Engineering / CAD-CAM",
    "Structural Engineering",
    "Artificial Intelligence & Machine Learning",
    "Data Science & Analytics",
    "Biotechnology",
    "Environmental Engineering",
    "Other",
  ],
  "me": [
    "Computer Engineering",
    "Electronics & Telecommunication",
    "Electrical Engineering",
    "Mechanical / Machine Design",
    "Structural Engineering",
    "Embedded Systems",
    "Control & Automation",
    "Other",
  ],
  "bca": [
    "Computer Applications (General)",
    "Software Engineering & Programming",
    "Cloud Computing & Cybersecurity",
    "Data Analytics & Web Technologies",
    "Mobile App Development",
    "Artificial Intelligence",
    "Other",
  ],
  "mca": [
    "Computer Applications (General)",
    "Software Engineering & Architecture",
    "Cloud Computing & DevOps",
    "Data Science & Machine Learning",
    "Cyber Security & Forensics",
    "Full Stack Application Development",
    "Other",
  ],
  "bba": [
    "Marketing Management",
    "Finance & Accounts",
    "Human Resource Management",
    "International Business",
    "Business Analytics",
    "Operations & Supply Chain",
    "Entrepreneurship & Family Business",
    "Banking & Insurance",
    "Other",
  ],
  "mba": [
    "Finance",
    "Marketing",
    "Human Resource Management",
    "Operations & Supply Chain Management",
    "Business Analytics & Data Science",
    "Information Technology / Systems",
    "International Business",
    "Healthcare & Hospital Management",
    "Banking & Financial Services",
    "Rural Management / Agri-Business",
    "Strategy & Management Consulting",
    "Retail & E-Commerce Management",
    "Other",
  ],
  "bsc": [
    "Computer Science",
    "Information Technology",
    "Mathematics",
    "Physics",
    "Chemistry",
    "Statistics",
    "Biotechnology",
    "Microbiology",
    "Zoology",
    "Botany",
    "Agriculture",
    "Nursing",
    "Electronics",
    "Economics",
    "Other",
  ],
  "msc": [
    "Computer Science",
    "Information Technology",
    "Mathematics",
    "Physics",
    "Chemistry",
    "Statistics & Data Science",
    "Biotechnology",
    "Microbiology",
    "Zoology",
    "Botany",
    "Agriculture",
    "Biochemistry",
    "Economics",
    "Other",
  ],
  "bcom": [
    "Accounting & Finance",
    "Banking & Insurance",
    "Taxation",
    "Computer Applications",
    "Financial Markets",
    "E-Commerce",
    "General",
    "Other",
  ],
  "mcom": [
    "Advanced Accounting & Auditing",
    "Finance & Banking",
    "Taxation & Tax Planning",
    "Business Management",
    "International Business",
    "General",
    "Other",
  ],
  "ba": [
    "Economics",
    "English Literature",
    "Political Science",
    "Psychology",
    "History",
    "Sociology",
    "Journalism & Mass Communication",
    "Geography",
    "Public Administration",
    "Philosophy",
    "Hindi Literature",
    "General",
    "Other",
  ],
  "ma": [
    "Economics",
    "English Literature",
    "Political Science",
    "Psychology",
    "History",
    "Sociology",
    "Journalism & Mass Communication",
    "Public Administration",
    "International Relations",
    "Philosophy",
    "Hindi Literature",
    "Other",
  ],
  "mbbs": [
    "General Medicine & Surgery",
    "Internal Medicine",
    "General Surgery",
    "Pediatrics",
    "Obstetrics & Gynecology",
    "Orthopedics",
    "Dermatology",
    "Ophthalmology",
    "Radiology",
    "Anesthesiology",
    "Psychiatry",
    "ENT (Otorhinolaryngology)",
    "Pathology",
    "Other",
  ],
  "bds": [
    "General Dentistry",
    "Orthodontics",
    "Oral & Maxillofacial Surgery",
    "Periodontics",
    "Prosthodontics",
    "Conservative Dentistry & Endodontics",
    "Pediatric Dentistry",
    "Oral Pathology & Microbiology",
    "Other",
  ],
  "llb": [
    "Corporate & Commercial Law",
    "Criminal Law",
    "Civil & Constitutional Law",
    "Intellectual Property Rights",
    "Tax & Financial Law",
    "Cyber Law",
    "Labor & Industrial Law",
    "General Legal Practice",
    "Other",
  ],
  "llm": [
    "Corporate & Business Law",
    "Constitutional & Administrative Law",
    "Criminal Law & Criminology",
    "Intellectual Property & Technology Law",
    "International Law & Human Rights",
    "Taxation Law",
    "Alternative Dispute Resolution",
    "Other",
  ],
  "diploma": [
    "Mechanical Engineering",
    "Electrical Engineering",
    "Civil Engineering",
    "Computer Science & Engineering",
    "Electronics & Communication",
    "Pharmacy (D.Pharm)",
    "Hotel Management & Catering",
    "Graphic Design & Multimedia",
    "Fashion Designing",
    "Interior Design",
    "Other",
  ],
  "ca": [
    "Auditing & Assurance",
    "Direct & Indirect Taxation",
    "Financial Management & Advisory",
    "Corporate Finance & Mergers",
    "Forensic Audit & Risk Management",
    "Accounting & Financial Reporting",
    "Other",
  ],
  "cs": [
    "Corporate Governance & Compliance",
    "Secretarial Audit & Due Diligence",
    "Securities & Capital Markets Law",
    "Corporate Restructuring & Insolvency",
    "Board Affairs & Advisory",
    "Other",
  ],
  "phd": [
    "Computer Science & Engineering",
    "Electronics & Engineering Sciences",
    "Management & Business Administration",
    "Physical Sciences (Physics / Chemistry)",
    "Mathematical & Statistical Sciences",
    "Biological & Life Sciences",
    "Economics & Commerce",
    "Humanities & Social Sciences",
    "Medical & Health Sciences",
    "Law & Legal Studies",
    "Other",
  ],
  "10th": [
    "General",
  ],
  "12th": [
    "Science (PCM - Physics, Chemistry, Maths)",
    "Science (PCB - Physics, Chemistry, Biology)",
    "Commerce with Mathematics",
    "Commerce without Mathematics",
    "Arts / Humanities",
    "Vocational",
    "Other",
  ],
  "other": [
    "General",
    "Other",
  ],
};

// ==============================================================================
// 4. OCCUPATIONS BY EMPLOYMENT STATUS SLUG
// Dependent master data relationship: EmploymentStatus -> Occupation
// Unique constraint: @@unique([employmentStatusId, slug])
// Note: "Software Engineer" under "employed" preserves id: 3c4881eb-1807-444b-8921-89477fcda754
// ==============================================================================
const EXISTING_SOFTWARE_ENGINEER_ID = "3c4881eb-1807-444b-8921-89477fcda754";

const OCCUPATIONS_BY_STATUS: Record<string, string[]> = {
  "employed": [
    "Software Engineer", // Will be assigned existing ID
    "Senior Software Engineer / Tech Lead",
    "Engineering Manager / Director",
    "Product Manager",
    "Data Scientist / AI Engineer",
    "Systems / DevOps / Cloud Engineer",
    "UI/UX Designer / Product Designer",
    "QA / Automation Test Engineer",
    "IT Consultant / Business Analyst",
    "Doctor / Physician",
    "Surgeon / Specialist Doctor",
    "Dentist / Dental Specialist",
    "Pharmacist / Healthcare Specialist",
    "Nurse / Nursing Officer",
    "Chartered Accountant (Corporate)",
    "Financial Analyst / Investment Banker",
    "Corporate Lawyer / Legal Counsel",
    "Management Consultant",
    "Human Resources (HR) Manager",
    "Marketing / Brand Manager",
    "Digital Marketing Specialist",
    "Sales / Business Development Manager",
    "Mechanical / Automobile Engineer",
    "Civil / Construction Engineer",
    "Electrical / Electronics Engineer",
    "Chemical Engineer",
    "Architect / Urban Planner",
    "Professor / Assistant Professor",
    "Teacher / Educator",
    "Journalist / Media Professional",
    "Operations / Supply Chain Manager",
    "Research Scientist / R&D Professional",
    "Corporate Executive (CXO / VP / Director)",
    "Banking Officer / Relationship Manager",
    "Commercial Pilot / Aviation Professional",
    "Cabin Crew / Hospitality Professional",
    "Other",
  ],
  "government-employee": [
    "IAS Officer",
    "IPS Officer",
    "IFS / Central Civil Services Officer",
    "State Civil Services (PCS / SAS) Officer",
    "Public Sector Bank (PSB) Officer",
    "PSU / Public Sector Engineer / Executive",
    "Railway Gazetted Officer",
    "Indian Railways Personnel",
    "Government School / College Teacher",
    "Government College / University Professor",
    "Government Doctor / Medical Officer",
    "Government Scientist / Researcher",
    "Judicial Officer / Magistrate / Judge",
    "Tax / Revenue / Customs Officer",
    "Police Officer (State Police)",
    "Municipal / Local Governance Officer",
    "Government Staff / Assistant",
    "Other",
  ],
  "defence": [
    "Indian Army Officer",
    "Indian Air Force Officer",
    "Indian Navy Officer",
    "Indian Coast Guard Officer",
    "Paramilitary Officer (CRPF / BSF / CISF / ITBP / SSB)",
    "Defence Non-Commissioned / JCO Rank",
    "Military Engineering Services (MES) / DRDO",
    "Military Medical Officer / AMC",
    "Other",
  ],
  "business-owner": [
    "Manufacturer / Industrialist",
    "Wholesaler / Distributor",
    "Retailer / Store Owner",
    "Trader / Merchant",
    "Civil / Construction Contractor",
    "Real Estate Developer / Builder",
    "Hotel / Restaurant / Cafe Owner",
    "Logistics / Fleet Operator",
    "Franchise Owner / Dealer",
    "Import / Export Business Owner",
    "Agri-Business Owner / Farm Owner",
    "Other",
  ],
  "entrepreneur": [
    "Tech Startup Founder / Co-Founder",
    "Digital Product / SaaS Entrepreneur",
    "E-Commerce Entrepreneur",
    "Agency Founder / Design & Marketing Studio",
    "Social Entrepreneur / NGO Founder",
    "Healthcare / Biotech Startup Founder",
    "FinTech / EdTech Startup Founder",
    "Other",
  ],
  "self-employed": [
    "Freelance Software Developer / Designer",
    "Consultant / Business Advisor",
    "Chartered Accountant (In Practice)",
    "Advocate / Lawyer (Private Practice)",
    "Doctor / Clinic Owner (Private Practice)",
    "Architect / Interior Designer",
    "Private Tutor / Coaching Institute Owner",
    "Financial Planner / Investment Advisor",
    "Real Estate Consultant / Broker",
    "Photographer / Videographer / Content Creator",
    "Writer / Author / Journalist",
    "Fitness Trainer / Yoga Instructor",
    "Artist / Musician / Performer",
    "Other",
  ],
  "student": [
    "Undergraduate Student",
    "Postgraduate / Master's Student",
    "Doctoral Scholar / PhD Researcher",
    "Competitive Exam Aspirant (Civil Services / Govt)",
    "Medical / Dental Intern",
    "Law Intern / CA Articleship",
    "Other",
  ],
  "not-working": [
    "Homemaker",
    "Seeking Employment / Actively Looking",
    "Taking a Career Break / Sabbatical",
    "Preparing for Higher Studies",
    "Other",
  ],
  "retired": [
    "Retired Corporate Professional",
    "Retired Government Officer",
    "Retired Defence Personnel",
    "Retired Educator / Professor",
    "Retired Banking Professional",
    "Other",
  ],
  "other": [
    "Other",
  ],
};

// ==============================================================================
// 5. ACCREDITED INSTITUTIONS (~200)
// High-profile, accredited Indian and premier international higher education institutions
// normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "")
// ==============================================================================
interface InstitutionSeedItem {
  name: string;
  type: string;
}

const INSTITUTIONS_RAW: InstitutionSeedItem[] = [
  // --- Indian Institutes of Technology (All 23 IITs) ---
  { name: "Indian Institute of Technology Bombay (IIT Bombay)", type: "IIT" },
  { name: "Indian Institute of Technology Delhi (IIT Delhi)", type: "IIT" },
  { name: "Indian Institute of Technology Madras (IIT Madras)", type: "IIT" },
  { name: "Indian Institute of Technology Kanpur (IIT Kanpur)", type: "IIT" },
  { name: "Indian Institute of Technology Kharagpur (IIT Kharagpur)", type: "IIT" },
  { name: "Indian Institute of Technology Roorkee (IIT Roorkee)", type: "IIT" },
  { name: "Indian Institute of Technology Guwahati (IIT Guwahati)", type: "IIT" },
  { name: "Indian Institute of Technology Hyderabad (IIT Hyderabad)", type: "IIT" },
  { name: "Indian Institute of Technology (BHU) Varanasi", type: "IIT" },
  { name: "Indian Institute of Technology (ISM) Dhanbad", type: "IIT" },
  { name: "Indian Institute of Technology Indore (IIT Indore)", type: "IIT" },
  { name: "Indian Institute of Technology Ropar (IIT Ropar)", type: "IIT" },
  { name: "Indian Institute of Technology Mandi (IIT Mandi)", type: "IIT" },
  { name: "Indian Institute of Technology Gandhinagar (IIT Gandhinagar)", type: "IIT" },
  { name: "Indian Institute of Technology Jodhpur (IIT Jodhpur)", type: "IIT" },
  { name: "Indian Institute of Technology Patna (IIT Patna)", type: "IIT" },
  { name: "Indian Institute of Technology Bhubaneswar (IIT Bhubaneswar)", type: "IIT" },
  { name: "Indian Institute of Technology Tirupati (IIT Tirupati)", type: "IIT" },
  { name: "Indian Institute of Technology Palakkad (IIT Palakkad)", type: "IIT" },
  { name: "Indian Institute of Technology Dharwad (IIT Dharwad)", type: "IIT" },
  { name: "Indian Institute of Technology Bhilai (IIT Bhilai)", type: "IIT" },
  { name: "Indian Institute of Technology Goa (IIT Goa)", type: "IIT" },
  { name: "Indian Institute of Technology Jammu (IIT Jammu)", type: "IIT" },

  // --- Indian Institutes of Management (All 21 IIMs) ---
  { name: "Indian Institute of Management Ahmedabad (IIM Ahmedabad)", type: "IIM" },
  { name: "Indian Institute of Management Bangalore (IIM Bangalore)", type: "IIM" },
  { name: "Indian Institute of Management Calcutta (IIM Calcutta)", type: "IIM" },
  { name: "Indian Institute of Management Lucknow (IIM Lucknow)", type: "IIM" },
  { name: "Indian Institute of Management Kozhikode (IIM Kozhikode)", type: "IIM" },
  { name: "Indian Institute of Management Indore (IIM Indore)", type: "IIM" },
  { name: "Indian Institute of Management Shillong (IIM Shillong)", type: "IIM" },
  { name: "Indian Institute of Management Rohtak (IIM Rohtak)", type: "IIM" },
  { name: "Indian Institute of Management Ranchi (IIM Ranchi)", type: "IIM" },
  { name: "Indian Institute of Management Raipur (IIM Raipur)", type: "IIM" },
  { name: "Indian Institute of Management Tiruchirappalli (IIM Trichy)", type: "IIM" },
  { name: "Indian Institute of Management Kashipur (IIM Kashipur)", type: "IIM" },
  { name: "Indian Institute of Management Udaipur (IIM Udaipur)", type: "IIM" },
  { name: "Indian Institute of Management Nagpur (IIM Nagpur)", type: "IIM" },
  { name: "Indian Institute of Management Visakhapatnam (IIM Visakhapatnam)", type: "IIM" },
  { name: "Indian Institute of Management Bodh Gaya (IIM Bodh Gaya)", type: "IIM" },
  { name: "Indian Institute of Management Amritsar (IIM Amritsar)", type: "IIM" },
  { name: "Indian Institute of Management Sambalpur (IIM Sambalpur)", type: "IIM" },
  { name: "Indian Institute of Management Sirmaur (IIM Sirmaur)", type: "IIM" },
  { name: "Indian Institute of Management Jammu (IIM Jammu)", type: "IIM" },
  { name: "Indian Institute of Management Mumbai (IIM Mumbai)", type: "IIM" },

  // --- Top National Institutes of Technology (NITs) ---
  { name: "National Institute of Technology Tiruchirappalli (NIT Trichy)", type: "NIT" },
  { name: "National Institute of Technology Karnataka, Surathkal (NIT Surathkal)", type: "NIT" },
  { name: "National Institute of Technology Warangal (NIT Warangal)", type: "NIT" },
  { name: "National Institute of Technology Rourkela (NIT Rourkela)", type: "NIT" },
  { name: "National Institute of Technology Calicut (NIT Calicut)", type: "NIT" },
  { name: "Motilal Nehru National Institute of Technology Allahabad (MNNIT)", type: "NIT" },
  { name: "Malaviya National Institute of Technology Jaipur (MNIT Jaipur)", type: "NIT" },
  { name: "Visvesvaraya National Institute of Technology Nagpur (VNIT)", type: "NIT" },
  { name: "Sardar Vallabhbhai National Institute of Technology Surat (SVNIT)", type: "NIT" },
  { name: "National Institute of Technology Kurukshetra (NIT Kurukshetra)", type: "NIT" },
  { name: "National Institute of Technology Durgapur (NIT Durgapur)", type: "NIT" },
  { name: "National Institute of Technology Silchar (NIT Silchar)", type: "NIT" },
  { name: "National Institute of Technology Hamirpur (NIT Hamirpur)", type: "NIT" },
  { name: "National Institute of Technology Jalandhar (NIT Jalandhar)", type: "NIT" },
  { name: "National Institute of Technology Patna (NIT Patna)", type: "NIT" },
  { name: "National Institute of Technology Raipur (NIT Raipur)", type: "NIT" },
  { name: "National Institute of Technology Srinagar (NIT Srinagar)", type: "NIT" },
  { name: "National Institute of Technology Meghalaya (NIT Meghalaya)", type: "NIT" },
  { name: "National Institute of Technology Agartala (NIT Agartala)", type: "NIT" },
  { name: "National Institute of Technology Goa (NIT Goa)", type: "NIT" },
  { name: "National Institute of Technology Jamshedpur (NIT Jamshedpur)", type: "NIT" },

  // --- Premier Engineering & Tech Institutes (BITS, IIITs, etc.) ---
  { name: "Birla Institute of Technology and Science, Pilani (BITS Pilani)", type: "DEEMED_UNIVERSITY" },
  { name: "BITS Pilani - Goa Campus", type: "INSTITUTE" },
  { name: "BITS Pilani - Hyderabad Campus", type: "INSTITUTE" },
  { name: "International Institute of Information Technology Hyderabad (IIIT Hyderabad)", type: "DEEMED_UNIVERSITY" },
  { name: "International Institute of Information Technology Bangalore (IIIT Bangalore)", type: "DEEMED_UNIVERSITY" },
  { name: "Indian Institute of Information Technology Allahabad (IIIT Allahabad)", type: "IIIT" },
  { name: "Indraprastha Institute of Information Technology Delhi (IIIT Delhi)", type: "STATE_UNIVERSITY" },
  { name: "Indian Institute of Information Technology, Design and Manufacturing Jabalpur (IIITDM Jabalpur)", type: "IIIT" },
  { name: "Indian Institute of Information Technology, Design and Manufacturing Kancheepuram (IIITDM Kancheepuram)", type: "IIIT" },
  { name: "Delhi Technological University (DTU)", type: "STATE_UNIVERSITY" },
  { name: "Netaji Subhas University of Technology (NSUT Delhi)", type: "STATE_UNIVERSITY" },
  { name: "College of Engineering, Pune (COEP Technological University)", type: "STATE_UNIVERSITY" },
  { name: "Veermata Jijabai Technological Institute (VJTI Mumbai)", type: "STATE_UNIVERSITY" },
  { name: "Jadavpur University Faculty of Engineering", type: "STATE_UNIVERSITY" },
  { name: "PSG College of Technology, Coimbatore", type: "INSTITUTE" },
  { name: "Thapar Institute of Engineering and Technology, Patiala", type: "DEEMED_UNIVERSITY" },
  { name: "Vellore Institute of Technology (VIT Vellore)", type: "DEEMED_UNIVERSITY" },
  { name: "SRM Institute of Science and Technology, Chennai", type: "DEEMED_UNIVERSITY" },
  { name: "Manipal Institute of Technology (MIT Manipal)", type: "INSTITUTE" },
  { name: "Amrita Vishwa Vidyapeetham, Coimbatore", type: "DEEMED_UNIVERSITY" },
  { name: "Birla Institute of Technology, Mesra (BIT Mesra)", type: "DEEMED_UNIVERSITY" },
  { name: "Harcourt Butler Technical University (HBTU Kanpur)", type: "STATE_UNIVERSITY" },
  { name: "PEC University of Technology, Chandigarh", type: "DEEMED_UNIVERSITY" },
  { name: "Indian Institute of Science, Bangalore (IISc Bangalore)", type: "DEEMED_UNIVERSITY" },
  { name: "Indian Institute of Space Science and Technology (IIST Thiruvananthapuram)", type: "DEEMED_UNIVERSITY" },

  // --- Premier Medical Institutes (AIIMS, JIPMER, CMC, etc.) ---
  { name: "All India Institute of Medical Sciences, New Delhi (AIIMS New Delhi)", type: "AIIMS" },
  { name: "All India Institute of Medical Sciences, Bhopal (AIIMS Bhopal)", type: "AIIMS" },
  { name: "All India Institute of Medical Sciences, Bhubaneswar (AIIMS Bhubaneswar)", type: "AIIMS" },
  { name: "All India Institute of Medical Sciences, Jodhpur (AIIMS Jodhpur)", type: "AIIMS" },
  { name: "All India Institute of Medical Sciences, Rishikesh (AIIMS Rishikesh)", type: "AIIMS" },
  { name: "All India Institute of Medical Sciences, Patna (AIIMS Patna)", type: "AIIMS" },
  { name: "All India Institute of Medical Sciences, Raipur (AIIMS Raipur)", type: "AIIMS" },
  { name: "All India Institute of Medical Sciences, Nagpur (AIIMS Nagpur)", type: "AIIMS" },
  { name: "Post Graduate Institute of Medical Education and Research (PGIMER Chandigarh)", type: "INSTITUTE" },
  { name: "Christian Medical College, Vellore (CMC Vellore)", type: "INSTITUTE" },
  { name: "Jawaharlal Institute of Postgraduate Medical Education and Research (JIPMER Puducherry)", type: "INSTITUTE" },
  { name: "King George's Medical University, Lucknow (KGMU Lucknow)", type: "STATE_UNIVERSITY" },
  { name: "Kasturba Medical College, Manipal (KMC Manipal)", type: "INSTITUTE" },
  { name: "Maulana Azad Medical College, New Delhi (MAMC Delhi)", type: "STATE_UNIVERSITY" },
  { name: "Lady Hardinge Medical College, New Delhi (LHMC Delhi)", type: "CENTRAL_UNIVERSITY" },
  { name: "Vardhman Mahavir Medical College and Safdarjung Hospital (VMMC Delhi)", type: "CENTRAL_UNIVERSITY" },
  { name: "Grant Government Medical College and Sir J.J. Group of Hospitals, Mumbai", type: "STATE_UNIVERSITY" },
  { name: "Seth G.S. Medical College and KEM Hospital, Mumbai", type: "STATE_UNIVERSITY" },
  { name: "Armed Forces Medical College, Pune (AFMC Pune)", type: "INSTITUTE" },
  { name: "Madras Medical College, Chennai (MMC Chennai)", type: "STATE_UNIVERSITY" },
  { name: "Institute of Medical Sciences, BHU Varanasi", type: "CENTRAL_UNIVERSITY" },
  { name: "St. John's Medical College, Bengaluru", type: "INSTITUTE" },
  { name: "Sri Ramachandra Institute of Higher Education and Research, Chennai", type: "DEEMED_UNIVERSITY" },
  { name: "Bangalore Medical College and Research Institute (BMCRI)", type: "STATE_UNIVERSITY" },
  { name: "Government Medical College, Thiruvananthapuram", type: "STATE_UNIVERSITY" },
  { name: "Medical College Kolkata", type: "STATE_UNIVERSITY" },

  // --- Premier Management, Commerce & Economics ---
  { name: "Faculty of Management Studies, University of Delhi (FMS Delhi)", type: "CENTRAL_UNIVERSITY" },
  { name: "XLRI - Xavier School of Management, Jamshedpur", type: "INSTITUTE" },
  { name: "SPJIMR - S.P. Jain Institute of Management and Research, Mumbai", type: "INSTITUTE" },
  { name: "Management Development Institute, Gurgaon (MDI Gurgaon)", type: "INSTITUTE" },
  { name: "Jamnalal Bajaj Institute of Management Studies, Mumbai (JBIMS Mumbai)", type: "STATE_UNIVERSITY" },
  { name: "Indian Institute of Foreign Trade, New Delhi (IIFT Delhi)", type: "DEEMED_UNIVERSITY" },
  { name: "Narsee Monjee Institute of Management Studies, Mumbai (NMIMS Mumbai)", type: "DEEMED_UNIVERSITY" },
  { name: "Symbiosis Institute of Business Management, Pune (SIBM Pune)", type: "DEEMED_UNIVERSITY" },
  { name: "Symbiosis Centre for Management and Human Resource Development (SCMHRD Pune)", type: "DEEMED_UNIVERSITY" },
  { name: "Xavier Institute of Management, Bhubaneswar (XIMB)", type: "PRIVATE_UNIVERSITY" },
  { name: "International Management Institute, New Delhi (IMI New Delhi)", type: "INSTITUTE" },
  { name: "Goa Institute of Management (GIM Goa)", type: "INSTITUTE" },
  { name: "Institute of Management Technology, Ghaziabad (IMT Ghaziabad)", type: "INSTITUTE" },
  { name: "Tata Institute of Social Sciences, Mumbai (TISS Mumbai)", type: "DEEMED_UNIVERSITY" },
  { name: "Delhi School of Economics, University of Delhi (DSE Delhi)", type: "CENTRAL_UNIVERSITY" },
  { name: "Shri Ram College of Commerce, University of Delhi (SRCC Delhi)", type: "CENTRAL_UNIVERSITY" },
  { name: "Lady Shri Ram College for Women, University of Delhi (LSR Delhi)", type: "CENTRAL_UNIVERSITY" },
  { name: "St. Stephen's College, University of Delhi", type: "CENTRAL_UNIVERSITY" },
  { name: "Loyola College, Chennai", type: "STATE_UNIVERSITY" },
  { name: "St. Xavier's College, Mumbai", type: "STATE_UNIVERSITY" },
  { name: "St. Xavier's College, Kolkata", type: "STATE_UNIVERSITY" },
  { name: "Christ University, Bengaluru", type: "DEEMED_UNIVERSITY" },
  { name: "Institute of Chartered Accountants of India (ICAI)", type: "PROFESSIONAL_BODY" },
  { name: "Institute of Company Secretaries of India (ICSI)", type: "PROFESSIONAL_BODY" },

  // --- Premier Law Schools ---
  { name: "National Law School of India University, Bengaluru (NLSIU Bengaluru)", type: "STATE_UNIVERSITY" },
  { name: "NALSAR University of Law, Hyderabad", type: "STATE_UNIVERSITY" },
  { name: "The West Bengal National University of Juridical Sciences (WBNUJS Kolkata)", type: "STATE_UNIVERSITY" },
  { name: "National Law University, Delhi (NLU Delhi)", type: "STATE_UNIVERSITY" },
  { name: "National Law University, Jodhpur (NLU Jodhpur)", type: "STATE_UNIVERSITY" },
  { name: "Gujarat National Law University, Gandhinagar (GNLU Gandhinagar)", type: "STATE_UNIVERSITY" },
  { name: "Symbiosis Law School, Pune (SLS Pune)", type: "DEEMED_UNIVERSITY" },
  { name: "Faculty of Law, University of Delhi", type: "CENTRAL_UNIVERSITY" },
  { name: "ILS Law College, Pune", type: "STATE_UNIVERSITY" },
  { name: "Government Law College, Mumbai (GLC Mumbai)", type: "STATE_UNIVERSITY" },

  // --- Major Central & State Universities ---
  { name: "University of Delhi (DU)", type: "CENTRAL_UNIVERSITY" },
  { name: "Jawaharlal Nehru University, New Delhi (JNU)", type: "CENTRAL_UNIVERSITY" },
  { name: "Banaras Hindu University, Varanasi (BHU)", type: "CENTRAL_UNIVERSITY" },
  { name: "Aligarh Muslim University, Aligarh (AMU)", type: "CENTRAL_UNIVERSITY" },
  { name: "Jamia Millia Islamia, New Delhi (JMI)", type: "CENTRAL_UNIVERSITY" },
  { name: "University of Hyderabad (UoH)", type: "CENTRAL_UNIVERSITY" },
  { name: "Visva-Bharati University, Santiniketan", type: "CENTRAL_UNIVERSITY" },
  { name: "Pondicherry University", type: "CENTRAL_UNIVERSITY" },
  { name: "University of Mumbai", type: "STATE_UNIVERSITY" },
  { name: "Savitribai Phule Pune University (SPPU Pune)", type: "STATE_UNIVERSITY" },
  { name: "Anna University, Chennai", type: "STATE_UNIVERSITY" },
  { name: "Panjab University, Chandigarh", type: "STATE_UNIVERSITY" },
  { name: "University of Calcutta, Kolkata", type: "STATE_UNIVERSITY" },
  { name: "University of Madras, Chennai", type: "STATE_UNIVERSITY" },
  { name: "Osmania University, Hyderabad", type: "STATE_UNIVERSITY" },
  { name: "Bangalore University, Bengaluru", type: "STATE_UNIVERSITY" },
  { name: "University of Rajasthan, Jaipur", type: "STATE_UNIVERSITY" },
  { name: "University of Lucknow, Lucknow", type: "STATE_UNIVERSITY" },
  { name: "University of Allahabad, Prayagraj", type: "CENTRAL_UNIVERSITY" },
  { name: "Patna University, Patna", type: "STATE_UNIVERSITY" },
  { name: "Gauhati University, Guwahati", type: "STATE_UNIVERSITY" },
  { name: "Tezpur University, Assam", type: "CENTRAL_UNIVERSITY" },
  { name: "Gujarat University, Ahmedabad", type: "STATE_UNIVERSITY" },
  { name: "Maharaja Sayajirao University of Baroda (MSU Baroda)", type: "STATE_UNIVERSITY" },
  { name: "Rashtrasant Tukadoji Maharaj Nagpur University", type: "STATE_UNIVERSITY" },
  { name: "Guru Gobind Singh Indraprastha University (GGSIPU Delhi)", type: "STATE_UNIVERSITY" },
  { name: "Ashoka University, Sonipat", type: "PRIVATE_UNIVERSITY" },
  { name: "Shiv Nadar University, Greater Noida", type: "PRIVATE_UNIVERSITY" },
  { name: "OP Jindal Global University, Sonipat", type: "PRIVATE_UNIVERSITY" },
  { name: "Kalinga Institute of Industrial Technology (KIIT Bhubaneswar)", type: "DEEMED_UNIVERSITY" },
  { name: "Siksha 'O' Anusandhan (SOA Bhubaneswar)", type: "DEEMED_UNIVERSITY" },
  { name: "Lovely Professional University (LPU Phagwara)", type: "PRIVATE_UNIVERSITY" },
  { name: "Chandigarh University, Mohali", type: "PRIVATE_UNIVERSITY" },
  { name: "Amity University, Noida", type: "PRIVATE_UNIVERSITY" },

  // --- Premier International Universities ---
  { name: "Harvard University", type: "INTERNATIONAL" },
  { name: "Stanford University", type: "INTERNATIONAL" },
  { name: "Massachusetts Institute of Technology (MIT)", type: "INTERNATIONAL" },
  { name: "University of Oxford", type: "INTERNATIONAL" },
  { name: "University of Cambridge", type: "INTERNATIONAL" },
  { name: "Imperial College London", type: "INTERNATIONAL" },
  { name: "National University of Singapore (NUS)", type: "INTERNATIONAL" },
  { name: "Nanyang Technological University (NTU Singapore)", type: "INTERNATIONAL" },
  { name: "Columbia University", type: "INTERNATIONAL" },
  { name: "Carnegie Mellon University (CMU)", type: "INTERNATIONAL" },
  { name: "University of California, Berkeley (UC Berkeley)", type: "INTERNATIONAL" },
  { name: "University of California, Los Angeles (UCLA)", type: "INTERNATIONAL" },
  { name: "University of Toronto", type: "INTERNATIONAL" },
  { name: "University of Melbourne", type: "INTERNATIONAL" },
  { name: "London School of Economics and Political Science (LSE)", type: "INTERNATIONAL" },
  { name: "New York University (NYU)", type: "INTERNATIONAL" },
  { name: "University of Washington, Seattle", type: "INTERNATIONAL" },
  { name: "Georgia Institute of Technology (Georgia Tech)", type: "INTERNATIONAL" },
  { name: "University of Illinois Urbana-Champaign (UIUC)", type: "INTERNATIONAL" },
  { name: "University of Texas at Austin", type: "INTERNATIONAL" },
  { name: "University of Michigan, Ann Arbor", type: "INTERNATIONAL" },
  { name: "Cornell University", type: "INTERNATIONAL" },
  { name: "Yale University", type: "INTERNATIONAL" },
  { name: "Princeton University", type: "INTERNATIONAL" },
];

export async function populateBatch4() {
  console.log("==================================================");
  console.log("MANGALAM MATRIMONY — MASTER DATA BATCH 4 POPULATION");
  console.log("EDUCATION & CAREER MASTER DATA (TRANSACTIONAL)");
  console.log("==================================================");

  // 1. Pre-population verification & record before counts
  const eduCountBefore = await prisma.education.count();
  const specCountBefore = await prisma.specialization.count();
  const instCountBefore = await prisma.institution.count();
  const empCountBefore = await prisma.employmentStatus.count();
  const occCountBefore = await prisma.occupation.count();

  const profileEduCountBefore = await prisma.profileEducation.count();
  const profileCareerCountBefore = await prisma.profileCareer.count();
  const prefEduCountBefore = await prisma.partnerPreferenceEducation.count();
  const prefOccCountBefore = await prisma.partnerPreferenceOccupation.count();

  console.log("\n[PRE-CHECK] Existing Master Data Counts:");
  console.log(`  Educations:          ${eduCountBefore}`);
  console.log(`  Specializations:     ${specCountBefore}`);
  console.log(`  Institutions:        ${instCountBefore}`);
  console.log(`  Employment Statuses: ${empCountBefore}`);
  console.log(`  Occupations:         ${occCountBefore}`);

  console.log("\n[PRE-CHECK] Existing Profile/Preference References:");
  console.log(`  ProfileEducations:   ${profileEduCountBefore}`);
  console.log(`  ProfileCareers:      ${profileCareerCountBefore}`);
  console.log(`  PrefEducations:      ${prefEduCountBefore}`);
  console.log(`  PrefOccupations:     ${prefOccCountBefore}`);

  // 2. Validate Deduplication on Input Datasets before touching DB
  console.log("\n[VALIDATION] Validating dataset integrity...");

  // Verify Educations unique slugs
  const eduSlugSet = new Set<string>();
  for (const e of EDUCATIONS) {
    if (eduSlugSet.has(e.slug)) throw new Error(`Duplicate slug in EDUCATIONS: ${e.slug}`);
    eduSlugSet.add(e.slug);
  }

  // Verify Employment Statuses unique slugs
  const empSlugSet = new Set<string>();
  for (const es of EMPLOYMENT_STATUSES) {
    if (empSlugSet.has(es.slug)) throw new Error(`Duplicate slug in EMPLOYMENT_STATUSES: ${es.slug}`);
    empSlugSet.add(es.slug);
  }

  // Verify Specializations per education unique slugs
  for (const [eduSlug, specNames] of Object.entries(SPECIALIZATIONS_BY_EDUCATION)) {
    if (!eduSlugSet.has(eduSlug)) {
      throw new Error(`Specialization mapped to unknown education slug: ${eduSlug}`);
    }
    const specSlugSet = new Set<string>();
    for (const name of specNames) {
      const slug = generateSlug(name);
      if (specSlugSet.has(slug)) {
        throw new Error(`Duplicate specialization slug under ${eduSlug}: ${slug} (${name})`);
      }
      specSlugSet.add(slug);
    }
  }

  // Verify Occupations per status unique slugs
  for (const [statusSlug, occNames] of Object.entries(OCCUPATIONS_BY_STATUS)) {
    if (!empSlugSet.has(statusSlug)) {
      throw new Error(`Occupation mapped to unknown employment status slug: ${statusSlug}`);
    }
    const occSlugSet = new Set<string>();
    for (const name of occNames) {
      const slug = generateSlug(name);
      if (occSlugSet.has(slug)) {
        throw new Error(`Duplicate occupation slug under ${statusSlug}: ${slug} (${name})`);
      }
      occSlugSet.add(slug);
    }
  }

  // Deduplicate Institutions by normalizedName
  const deduplicatedInstitutions: Array<{ name: string; normalizedName: string; type: string }> = [];
  const instNormSet = new Set<string>();
  let instDuplicatesFiltered = 0;

  for (const item of INSTITUTIONS_RAW) {
    const cleanName = item.name.trim();
    const norm = normalizeInstitutionName(cleanName);
    if (instNormSet.has(norm)) {
      console.warn(`  [DEDUPLICATION] Filtered duplicate institution: "${cleanName}" (normalized: "${norm}")`);
      instDuplicatesFiltered++;
    } else {
      instNormSet.add(norm);
      deduplicatedInstitutions.push({
        name: cleanName,
        normalizedName: norm,
        type: item.type,
      });
    }
  }

  console.log(`✓ Dataset validation passed cleanly.`);
  console.log(`  Deduplicated institutions count: ${deduplicatedInstitutions.length} (filtered ${instDuplicatesFiltered} duplicates)`);

  // 3. Transactional Idempotent Population
  console.log("\n[EXECUTION] Beginning transactional population...");

  let addedEdu = 0;
  let updatedEdu = 0;
  let addedEmp = 0;
  let updatedEmp = 0;
  let addedSpec = 0;
  let updatedSpec = 0;
  let addedOcc = 0;
  let updatedOcc = 0;
  let addedInst = 0;
  let updatedInst = 0;

  await prisma.$transaction(async (tx) => {
    // A) Seed Educations (preserve existing IDs and relations)
    const educationMap = new Map<string, string>(); // slug -> ID

    for (const edu of EDUCATIONS) {
      const existing = await tx.education.findUnique({
        where: { slug: edu.slug },
      });

      if (existing) {
        await tx.education.update({
          where: { id: existing.id },
          data: { name: edu.name, sortOrder: edu.sortOrder, isActive: true },
        });
        educationMap.set(edu.slug, existing.id);
        updatedEdu++;
      } else {
        const created = await tx.education.create({
          data: { name: edu.name, slug: edu.slug, sortOrder: edu.sortOrder, isActive: true },
        });
        educationMap.set(edu.slug, created.id);
        addedEdu++;
      }
    }

    // B) Seed Employment Statuses (preserve existing IDs and relations)
    const employmentStatusMap = new Map<string, string>(); // slug -> ID

    for (const emp of EMPLOYMENT_STATUSES) {
      const existing = await tx.employmentStatus.findUnique({
        where: { slug: emp.slug },
      });

      if (existing) {
        await tx.employmentStatus.update({
          where: { id: existing.id },
          data: { name: emp.name, sortOrder: emp.sortOrder, isActive: true },
        });
        employmentStatusMap.set(emp.slug, existing.id);
        updatedEmp++;
      } else {
        const created = await tx.employmentStatus.create({
          data: { name: emp.name, slug: emp.slug, sortOrder: emp.sortOrder, isActive: true },
        });
        employmentStatusMap.set(emp.slug, created.id);
        addedEmp++;
      }
    }

    // C) Seed Specializations (Education -> Specialization)
    for (const [eduSlug, specNames] of Object.entries(SPECIALIZATIONS_BY_EDUCATION)) {
      const eduId = educationMap.get(eduSlug);
      if (!eduId) throw new Error(`Missing educationId for slug ${eduSlug}`);

      let specSort = 1;
      for (const name of specNames) {
        const slug = generateSlug(name);
        const existing = await tx.specialization.findUnique({
          where: {
            educationId_slug: {
              educationId: eduId,
              slug,
            },
          },
        });

        if (existing) {
          await tx.specialization.update({
            where: { id: existing.id },
            data: { name, sortOrder: specSort, isActive: true },
          });
          updatedSpec++;
        } else {
          await tx.specialization.create({
            data: {
              educationId: eduId,
              name,
              slug,
              sortOrder: specSort,
              isActive: true,
            },
          });
          addedSpec++;
        }
        specSort++;
      }
    }

    // D) Seed Occupations (EmploymentStatus -> Occupation)
    for (const [statusSlug, occNames] of Object.entries(OCCUPATIONS_BY_STATUS)) {
      const statusId = employmentStatusMap.get(statusSlug);
      if (!statusId) throw new Error(`Missing employmentStatusId for slug ${statusSlug}`);

      let occSort = 1;
      for (const name of occNames) {
        const slug = generateSlug(name);
        const existing = await tx.occupation.findUnique({
          where: {
            employmentStatusId_slug: {
              employmentStatusId: statusId,
              slug,
            },
          },
        });

        if (existing) {
          await tx.occupation.update({
            where: { id: existing.id },
            data: { name, sortOrder: occSort, isActive: true },
          });
          updatedOcc++;
        } else {
          // Check if this is the canonical Software Engineer under employed
          const isSoftwareEngineer = statusSlug === "employed" && slug === "software-engineer";
          const targetId = isSoftwareEngineer ? EXISTING_SOFTWARE_ENGINEER_ID : undefined;

          // Double check if targetId already exists by ID
          if (targetId) {
            const existingById = await tx.occupation.findUnique({ where: { id: targetId } });
            if (existingById) {
              await tx.occupation.update({
                where: { id: targetId },
                data: { name, employmentStatusId: statusId, slug, sortOrder: occSort, isActive: true },
              });
              updatedOcc++;
              occSort++;
              continue;
            }
          }

          await tx.occupation.create({
            data: {
              ...(targetId ? { id: targetId } : {}),
              employmentStatusId: statusId,
              name,
              slug,
              sortOrder: occSort,
              isActive: true,
            },
          });
          addedOcc++;
        }
        occSort++;
      }
    }

    // E) Seed Institutions
    for (const inst of deduplicatedInstitutions) {
      const existing = await tx.institution.findFirst({
        where: { normalizedName: inst.normalizedName },
      });

      if (existing) {
        await tx.institution.update({
          where: { id: existing.id },
          data: { name: inst.name, type: inst.type, isActive: true },
        });
        updatedInst++;
      } else {
        await tx.institution.create({
          data: {
            name: inst.name,
            normalizedName: inst.normalizedName,
            type: inst.type,
            isActive: true,
          },
        });
        addedInst++;
      }
    }
  }, { timeout: 60000 });

  console.log("✓ Transaction committed successfully.");

  // 4. Post-population verification
  const eduCountAfter = await prisma.education.count();
  const specCountAfter = await prisma.specialization.count();
  const instCountAfter = await prisma.institution.count();
  const empCountAfter = await prisma.employmentStatus.count();
  const occCountAfter = await prisma.occupation.count();

  const profileEduCountAfter = await prisma.profileEducation.count();
  const profileCareerCountAfter = await prisma.profileCareer.count();
  const prefEduCountAfter = await prisma.partnerPreferenceEducation.count();
  const prefOccCountAfter = await prisma.partnerPreferenceOccupation.count();

  // Verify orphan counts
  const allSpecs = await prisma.specialization.findMany({ select: { educationId: true } });
  const validEduIds = new Set((await prisma.education.findMany({ select: { id: true } })).map((e) => e.id));
  const orphanSpecs = allSpecs.filter((s) => !validEduIds.has(s.educationId)).length;

  const allOccs = await prisma.occupation.findMany({ select: { employmentStatusId: true } });
  const validEmpIds = new Set((await prisma.employmentStatus.findMany({ select: { id: true } })).map((es) => es.id));
  const orphanOccs = allOccs.filter((o) => !validEmpIds.has(o.employmentStatusId)).length;

  // Verify Software Engineer record
  const softEng = await prisma.occupation.findFirst({
    where: { slug: "software-engineer" },
    include: { employmentStatus: true },
  });

  console.log("\n==================================================");
  console.log("BATCH 4 POPULATION SUMMARY REPORT");
  console.log("==================================================");
  console.log(`Education:`);
  console.log(`  - Before count:           ${eduCountBefore}`);
  console.log(`  - Added:                  ${addedEdu}`);
  console.log(`  - Deduplicated/normalized: 0`);
  console.log(`  - Final count:            ${eduCountAfter}`);

  console.log(`\nSpecializations:`);
  console.log(`  - Before count:           ${specCountBefore}`);
  console.log(`  - Added:                  ${addedSpec}`);
  console.log(`  - Deduplicated/normalized: 0`);
  console.log(`  - Final count:            ${specCountAfter}`);

  console.log(`\nInstitutions:`);
  console.log(`  - Before count:           ${instCountBefore}`);
  console.log(`  - Added:                  ${addedInst}`);
  console.log(`  - Deduplicated/normalized: ${instDuplicatesFiltered}`);
  console.log(`  - Final count:            ${instCountAfter}`);

  console.log(`\nEmployment Statuses:`);
  console.log(`  - Before count:           ${empCountBefore}`);
  console.log(`  - Added:                  ${addedEmp}`);
  console.log(`  - Deduplicated/normalized: 0`);
  console.log(`  - Final count:            ${empCountAfter}`);

  console.log(`\nOccupations:`);
  console.log(`  - Before count:           ${occCountBefore}`);
  console.log(`  - Added:                  ${addedOcc}`);
  console.log(`  - Deduplicated/normalized: 0`);
  console.log(`  - Final count:            ${occCountAfter}`);

  console.log(`\nIntegrity:`);
  console.log(`  - Orphan specializations:  ${orphanSpecs} (expected 0)`);
  console.log(`  - Orphan occupations:      ${orphanOccs} (expected 0)`);
  console.log(`  - Software Engineer ID:    ${softEng?.id} (expected ${EXISTING_SOFTWARE_ENGINEER_ID})`);
  console.log(`  - Software Engineer status: ${softEng?.employmentStatus?.slug}`);
  console.log(`  - ProfileEducations:       ${profileEduCountAfter} (before: ${profileEduCountBefore})`);
  console.log(`  - ProfileCareers:          ${profileCareerCountAfter} (before: ${profileCareerCountBefore})`);
  console.log(`  - PrefEducations:          ${prefEduCountAfter} (before: ${prefEduCountBefore})`);
  console.log(`  - PrefOccupations:         ${prefOccCountAfter} (before: ${prefOccCountBefore})`);
  console.log("==================================================");

  if (profileEduCountBefore !== profileEduCountAfter || profileCareerCountBefore !== profileCareerCountAfter) {
    throw new Error("FATAL: Profile record count discrepancy detected!");
  }
  if (orphanSpecs !== 0 || orphanOccs !== 0) {
    throw new Error("FATAL: Orphan records detected!");
  }
}

if (require.main === module) {
  populateBatch4()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("[BATCH 4 ERROR]:", err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
