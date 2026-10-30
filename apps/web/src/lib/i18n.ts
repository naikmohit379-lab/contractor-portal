import { interpolateText, resolveLocalizedText } from "@roofdesk/shared";
import { useAuth } from "./auth";

const en = {
  "common.more": "More", "common.signOut": "Sign out", "common.loadingWorkspace": "Loading your workspace",
  "common.cancel": "Cancel", "common.save": "Save", "common.saving": "Saving…", "common.language": "Language",
  "nav.dashboard": "Dashboard", "nav.home": "Home", "nav.myWork": "My work", "nav.jobs": "Jobs",
  "nav.payments": "Payments", "nav.suppliers": "Suppliers", "nav.priceList": "Price list", "nav.waiverForms": "Waiver forms",
  "nav.settings": "Settings", "nav.admin": "Admin Panel", "nav.team": "Team access", "nav.portal": "Portal",
  "dashboard.welcome": "Welcome, {name}", "dashboard.jobsAcross": "{count} jobs across your pipeline", "dashboard.loadingPipeline": "Loading your pipeline",
  "dashboard.pipeline": "Pipeline", "dashboard.recentJobs": "Recent jobs", "dashboard.viewAll": "View all jobs",
  "dashboard.noJobs": "No jobs yet.", "dashboard.createFirst": "Create your first job", "dashboard.toMeasure": "to order a roof measurement.",
  "jobs.title": "Jobs", "jobs.new": "New job", "jobs.create": "Create job", "jobs.creating": "Creating job", "jobs.search": "Search customer, address or job number",
  "jobs.allStages": "All stages", "jobs.filterStage": "Filter by stage", "jobs.loading": "Loading jobs", "jobs.loadError": "Jobs could not be loaded. Refresh to try again.",
  "jobs.none": "No jobs match. Change the filters or create a new job.", "jobs.customerName": "Customer name", "jobs.phone": "Phone", "jobs.email": "Email", "jobs.jobType": "Job type",
  "jobs.addressLine1": "Address line 1", "jobs.addressLine2": "Address line 2 (optional)", "jobs.city": "City / town / locality", "jobs.district": "District",
  "jobs.stateIndia": "State / Union Territory", "jobs.stateUs": "State (2-letter code)", "jobs.pinCode": "PIN code", "jobs.zip": "ZIP code", "jobs.country": "Country",
  "jobs.landmark": "Landmark (optional)", "jobs.countryIndia": "India", "jobs.countryUs": "United States", "jobs.searchLabel": "Search jobs",
  "jobs.type.insurance": "Insurance restoration", "jobs.type.retail": "Retail replacement", "jobs.type.commercial": "Commercial roofing",
  "validation.customerName": "Enter the customer name", "validation.streetAddress": "Enter the street address", "validation.city": "Enter the city, town, or locality",
  "validation.district": "Enter the district", "validation.state": "Enter the state or Union Territory", "validation.pinCode": "Enter a valid 6-digit PIN code",
  "validation.zip": "Enter the ZIP code", "validation.usState": "Use the 2-letter state code", "validation.email": "Enter a valid email address",
  "stage.lead": "Lead", "stage.measured": "Measured", "stage.estimated": "Estimated", "stage.claim_filed": "Claim filed",
  "stage.approved": "Approved", "stage.materials_ordered": "Materials ordered", "stage.in_progress": "In progress", "stage.complete": "Complete", "stage.paid": "Paid",
  "estimate.loading": "Loading estimate", "estimate.build": "Build the estimate", "estimate.orderFirst": "Order and receive a measurement report first. Quantities are taken from it.",
  "estimate.startTemplate": "Start from a standard re-roof template. Quantities come from the measurement report and you can edit every line afterwards.",
  "estimate.measurementReport": "Measurement report", "estimate.buildFromReport": "Build estimate from report", "estimate.building": "Building estimate",
  "estimate.unitPrice": "Unit price", "estimate.addLine": "Add blank line", "estimate.addFromPriceList": "Add an item from your price list...", "estimate.save": "Save estimate",
  "estimate.title": "Estimate", "estimate.csvHandoff": "Download handoff CSV", "estimate.printPdf": "Print / Save PDF",
  "estimate.carrierVersion": "Record carrier-approved version", "estimate.newSupplement": "New supplement version", "estimate.localRatesBlank": "Local rates are blank. Enter and verify local material and labour prices before issuing this estimate.",
  "settings.title": "Settings", "settings.marketTitle": "Company market and display", "settings.marketHelp": "These preferences apply to everyone in {company}. Existing financial records are not converted when these settings change.",
  "settings.country": "Market / country", "settings.currency": "Currency", "settings.locale": "Number and date format", "settings.language": "Display language",
  "settings.timezone": "Time zone", "settings.units": "Measurement units", "settings.metric": "Metric (m², m, mm)", "settings.imperial": "Imperial (ft², ft, in)",
  "settings.english": "English", "settings.hindi": "Hindi", "settings.saved": "Company preferences saved.", "settings.marketLocked": "Country and currency are locked after work or price data is created to protect existing values.",
  "settings.emailTitle": "Email notifications", "settings.emailHelp": "In-app updates always appear in the RoofDesk bell. Choose what is also emailed to {email}.",
  "settings.companyControls": "Company controls", "settings.savePreferences": "Save preferences", "settings.savingPreferences": "Saving preferences…",
  "validation.timezone": "Enter a valid time zone, such as Asia/Kolkata",
} as const;

const hi: Partial<Record<keyof typeof en, string>> = {
  "common.more": "और", "common.signOut": "साइन आउट", "common.loadingWorkspace": "आपका कार्यक्षेत्र लोड हो रहा है",
  "common.cancel": "रद्द करें", "common.save": "सहेजें", "common.saving": "सहेजा जा रहा है…", "common.language": "भाषा",
  "nav.dashboard": "डैशबोर्ड", "nav.home": "होम", "nav.myWork": "मेरा काम", "nav.jobs": "काम",
  "nav.payments": "भुगतान", "nav.suppliers": "आपूर्तिकर्ता", "nav.priceList": "मूल्य सूची", "nav.waiverForms": "छूट फ़ॉर्म",
  "nav.settings": "सेटिंग्स", "nav.admin": "एडमिन पैनल", "nav.team": "टीम एक्सेस", "nav.portal": "पोर्टल",
  "dashboard.welcome": "स्वागत है, {name}", "dashboard.jobsAcross": "आपकी पाइपलाइन में {count} काम", "dashboard.loadingPipeline": "आपकी पाइपलाइन लोड हो रही है",
  "dashboard.pipeline": "कार्य पाइपलाइन", "dashboard.recentJobs": "हाल के काम", "dashboard.viewAll": "सभी काम देखें",
  "dashboard.noJobs": "अभी कोई काम नहीं है।", "dashboard.createFirst": "अपना पहला काम बनाएं", "dashboard.toMeasure": "छत का माप ऑर्डर करने के लिए।",
  "jobs.title": "काम", "jobs.new": "नया काम", "jobs.create": "काम बनाएं", "jobs.creating": "काम बनाया जा रहा है", "jobs.search": "ग्राहक, पता या काम नंबर खोजें",
  "jobs.allStages": "सभी चरण", "jobs.filterStage": "चरण से फ़िल्टर करें", "jobs.loading": "काम लोड हो रहे हैं", "jobs.loadError": "काम लोड नहीं हुए। फिर से कोशिश करने के लिए रीफ़्रेश करें।",
  "jobs.none": "कोई काम नहीं मिला। फ़िल्टर बदलें या नया काम बनाएं।", "jobs.customerName": "ग्राहक का नाम", "jobs.phone": "फ़ोन", "jobs.email": "ईमेल", "jobs.jobType": "काम का प्रकार",
  "jobs.addressLine1": "पता पंक्ति 1", "jobs.addressLine2": "पता पंक्ति 2 (वैकल्पिक)", "jobs.city": "शहर / कस्बा / इलाका", "jobs.district": "ज़िला",
  "jobs.stateIndia": "राज्य / केंद्र शासित प्रदेश", "jobs.stateUs": "राज्य (2 अक्षर का कोड)", "jobs.pinCode": "पिन कोड", "jobs.zip": "ज़िप कोड", "jobs.country": "देश",
  "jobs.landmark": "पहचान का स्थान (वैकल्पिक)", "jobs.countryIndia": "भारत", "jobs.countryUs": "संयुक्त राज्य", "jobs.searchLabel": "काम खोजें",
  "jobs.type.insurance": "बीमा मरम्मत", "jobs.type.retail": "खुदरा छत बदलना", "jobs.type.commercial": "व्यावसायिक छत",
  "validation.customerName": "ग्राहक का नाम दर्ज करें", "validation.streetAddress": "सड़क का पता दर्ज करें", "validation.city": "शहर, कस्बा या इलाका दर्ज करें",
  "validation.district": "ज़िला दर्ज करें", "validation.state": "राज्य या केंद्र शासित प्रदेश दर्ज करें", "validation.pinCode": "6 अंकों का सही पिन कोड दर्ज करें",
  "validation.zip": "ज़िप कोड दर्ज करें", "validation.usState": "2 अक्षर का राज्य कोड लिखें", "validation.email": "सही ईमेल पता दर्ज करें",
  "stage.lead": "नई पूछताछ", "stage.measured": "माप लिया गया", "stage.estimated": "अनुमान तैयार", "stage.claim_filed": "दावा दर्ज",
  "stage.approved": "स्वीकृत", "stage.materials_ordered": "सामग्री ऑर्डर की", "stage.in_progress": "काम जारी", "stage.complete": "पूरा", "stage.paid": "भुगतान हुआ",
  "estimate.loading": "अनुमान लोड हो रहा है", "estimate.build": "अनुमान बनाएं", "estimate.orderFirst": "पहले माप रिपोर्ट ऑर्डर करके प्राप्त करें। मात्रा उसी से ली जाएगी।",
  "estimate.startTemplate": "मानक छत नवीनीकरण टेम्पलेट से शुरू करें। मात्रा माप रिपोर्ट से आएगी और हर पंक्ति बदली जा सकती है।",
  "estimate.measurementReport": "माप रिपोर्ट", "estimate.buildFromReport": "रिपोर्ट से अनुमान बनाएं", "estimate.building": "अनुमान बनाया जा रहा है",
  "estimate.unitPrice": "इकाई मूल्य", "estimate.addLine": "खाली पंक्ति जोड़ें", "estimate.addFromPriceList": "मूल्य सूची से वस्तु जोड़ें...", "estimate.save": "अनुमान सहेजें",
  "estimate.title": "अनुमान", "estimate.csvHandoff": "हैंडऑफ़ CSV डाउनलोड करें", "estimate.printPdf": "प्रिंट / PDF सहेजें",
  "estimate.carrierVersion": "बीमा स्वीकृत संस्करण दर्ज करें", "estimate.newSupplement": "नया पूरक संस्करण", "estimate.localRatesBlank": "स्थानीय दरें खाली हैं। अनुमान जारी करने से पहले स्थानीय सामग्री और श्रम की कीमतें दर्ज करके सत्यापित करें।",
  "settings.title": "सेटिंग्स", "settings.marketTitle": "कंपनी का बाज़ार और प्रदर्शन", "settings.marketHelp": "ये प्राथमिकताएं {company} में सभी पर लागू होंगी। मौजूदा वित्तीय रिकॉर्ड की मुद्रा नहीं बदली जाएगी।",
  "settings.country": "बाज़ार / देश", "settings.currency": "मुद्रा", "settings.locale": "संख्या और तारीख़ का प्रारूप", "settings.language": "प्रदर्शन भाषा",
  "settings.timezone": "समय क्षेत्र", "settings.units": "माप की इकाइयाँ", "settings.metric": "मीट्रिक (m², m, mm)", "settings.imperial": "इम्पीरियल (ft², ft, in)",
  "settings.english": "अंग्रेज़ी", "settings.hindi": "हिंदी", "settings.saved": "कंपनी की प्राथमिकताएं सहेजी गईं।", "settings.marketLocked": "मौजूदा मूल्यों की सुरक्षा के लिए काम या मूल्य डेटा बनने के बाद देश और मुद्रा लॉक हो जाते हैं।",
  "settings.emailTitle": "ईमेल सूचनाएं", "settings.emailHelp": "ऐप की सूचनाएं RoofDesk घंटी में आती रहेंगी। चुनें कि {email} को कौन-सी सूचनाएं ईमेल से भी भेजी जाएं।",
  "settings.companyControls": "कंपनी नियंत्रण", "settings.savePreferences": "प्राथमिकताएं सहेजें", "settings.savingPreferences": "प्राथमिकताएं सहेजी जा रही हैं…",
};

export type I18nKey = keyof typeof en;
export type Language = "en" | "hi";

export function translate(language: Language, key: I18nKey, values: Record<string, string | number> = {}): string {
  const template = resolveLocalizedText(language, en[key], hi[key]);
  return interpolateText(template, values);
}

const validationKeys: Record<string, I18nKey> = {
  "Enter the customer name": "validation.customerName",
  "Enter the street address": "validation.streetAddress",
  "Enter the city, town, or locality": "validation.city",
  "Enter the district": "validation.district",
  "Enter the state or Union Territory": "validation.state",
  "Enter a valid 6-digit PIN code": "validation.pinCode",
  "Enter the ZIP code": "validation.zip",
  "Use the 2-letter state code": "validation.usState",
  "Enter a valid email address": "validation.email",
  "Enter a valid time zone, such as Asia/Kolkata": "validation.timezone",
};

export function translateValidation(language: Language, message?: string): string | undefined {
  return message ? (validationKeys[message] ? translate(language, validationKeys[message]!) : message) : message;
}

export function useI18n() {
  const { user } = useAuth();
  const language = user?.company.settings?.language ?? "en";
  return { language, t: (key: I18nKey, values?: Record<string, string | number>) => translate(language, key, values), validation: (message?: string) => translateValidation(language, message) };
}
