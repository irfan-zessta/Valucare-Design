"""Master data, field schemas and configuration defaults.

Provenance tags used throughout (shown in the UI and the parity checklist):
  "legacy"   - verified in the HMS3 UAT inspection (HMS3-New-Sales-Audit-2026-10-08)
  "proposed" - from the Corporate Sales NB requirements v1.1 (draft)
  "pending"  - business rule awaiting confirmation; kept configurable
  "demo"     - fictional/placeholder master data for this build; replace from HMS3 masters
"""

# ROLES — aligned to the two source-of-truth documents:
#   * SALES NEW BUSINESS CORP. PROCESS FLOWCHART 2026 (AAT / AMT / Actuarial / LEGAL)
#   * Actuarial Process Flow (Actuarial quotation routing)
# The exact labels AAT and AMT are preserved; their full names are NOT confirmed
# by the source, so they are never expanded. Only the roles the documents assign
# are treated as confirmed. Everything the source leaves silent (pricing/SOB
# approver titles, billing/member-enrolment/activation owners, downstream
# acknowledgers) is kept as an explicitly "pending confirmation" participant so
# the step stays visible and the owner stays unresolved — not invented.
ROLES = {
    # ---- Source-confirmed Corporate New Business participants ----
    "aat": "AAT",
    "amt": "AMT",
    "accusa": "Actuarial",
    "legal": "Legal Department",
    # ---- Ownership not established by the source (kept visible + configurable) ----
    "approver": "Approver (pending confirmation)",
    "mda": "MDA (internal alignment)",
    "bc": "B&C (internal alignment)",
    "ccd": "CCD (downstream)",
    # ---- Technical account, not a business-process participant ----
    "admin": "System Administrator (technical)",
}

# Fictional demo users. IDs are UNCHANGED from the pre-migration build so every
# existing record, approval and audit entry (which reference the user id, not the
# role) stays intact; only each account's role and display name were remapped to
# the source-aligned model. See docs/ROLE-MIGRATION.md for the full mapping.
# Multiple accounts share a role on purpose so maker-checker separation can be
# exercised (two AMT users, several approvers for first/second-level sign-off).
USERS = [
    # AAT — all Sales New Business handler work (was Account Manager / Compliance-KYC)
    {"id": "u-am1", "name": "AAT Demo User", "role": "aat", "team": None},
    {"id": "u-am2", "name": "AAT Demo User 2", "role": "aat", "team": None},
    {"id": "u-am3", "name": "AAT Demo User 3", "role": "aat", "team": None},
    {"id": "u-co1", "name": "AAT Demo User 4 (KYC desk)", "role": "aat", "team": None},
    # AMT — franchise upload/approval, contract endorsement, account/plan/COC setup
    {"id": "u-as1", "name": "AMT Demo User", "role": "amt", "team": None},
    {"id": "u-as2", "name": "AMT Demo User 2", "role": "amt", "team": None},
    {"id": "u-we1", "name": "AMT Demo User 3 (orientation)", "role": "amt", "team": None},
    # Actuarial — rate sheet / quotation routing
    {"id": "u-ac1", "name": "Actuarial Demo User", "role": "accusa", "team": None},
    # Legal — draft contract preparation and review
    {"id": "u-lg1", "name": "Legal Demo User", "role": "legal", "team": None},
    # Approver — first/second-level approvals the source does not title (pending)
    {"id": "u-sm1", "name": "Approver Demo User (pending confirmation)", "role": "approver", "team": None},
    {"id": "u-sm2", "name": "Approver Demo User 2 (pending confirmation)", "role": "approver", "team": None},
    {"id": "u-sr1", "name": "Approver Demo User 3 (pending confirmation)", "role": "approver", "team": None},
    {"id": "u-va1", "name": "Approver Demo User 4 (pending confirmation)", "role": "approver", "team": None},
    # Internal-alignment / downstream participants named only collectively (pending)
    {"id": "u-md1", "name": "MDA Demo User (internal alignment)", "role": "mda", "team": None},
    {"id": "u-bc1", "name": "B&C Demo User (internal alignment)", "role": "bc", "team": None},
    {"id": "u-bc2", "name": "B&C Demo User 2 (internal alignment)", "role": "bc", "team": None},
    {"id": "u-cc1", "name": "CCD Demo User (downstream)", "role": "ccd", "team": None},
    # Technical account only — not a documented business participant
    {"id": "u-ad1", "name": "System Admin (technical)", "role": "admin", "team": None},
]

# Roles that own a workflow step the source documents do NOT assign an owner to.
# Used to label those steps "assignment pending confirmation" and to keep any
# demo action on them flagged as a simulation, never an assumed production right.
PENDING_ROLES = {"approver", "mda", "bc", "ccd"}

STAGES = [
    {"n": 1, "key": "lead", "label": "Lead"},
    {"n": 2, "key": "franchise", "label": "Franchise"},
    {"n": 3, "key": "quotation", "label": "Quotation"},
    {"n": 4, "key": "proposal", "label": "Proposal and Negotiation"},
    {"n": 5, "key": "contract", "label": "Contract and KYC"},
    {"n": 6, "key": "account", "label": "Account Setup"},
    {"n": 7, "key": "plans", "label": "Final SOB and Plan Codes"},
    {"n": 8, "key": "members", "label": "Member Data and Billing"},
    {"n": 9, "key": "activation", "label": "Activation and Handover"},
]

# ---------------------------------------------------------------- legacy options
OPTIONS = {
    # Franchise > Account Info > Account Type (legacy). This is the PRODUCT type.
    "franchiseAccountType": [
        {"value": "CORPORATE/HMO", "label": "CORPORATE/HMO", "src": "legacy"},
        {"value": "TPA/ASO", "label": "TPA/ASO", "src": "legacy"},
    ],
    "vatStatus": [
        {"value": v, "label": v, "src": "legacy"}
        for v in ["20% VAT-able", "Fully VAT-able", "Non Vat", "VAT exempt", "VAT-able", "Zero Rated"]
    ],
    # Current Coverage: legacy label + legacy code are both preserved.
    "currentCoverage": [
        {"value": "AA", "label": "None (AA)", "src": "legacy"},
        {"value": "CP", "label": "HMI (CP)", "src": "legacy"},
        {"value": "TP", "label": "TPA (TP)", "src": "legacy"},
        {"value": "AT", "label": "HMO (AT)", "src": "legacy"},
    ],
    "mannerOfEnrollment": [
        {"value": "Compulsory", "label": "Compulsory", "src": "legacy"},
        {"value": "Voluntary", "label": "Voluntary", "src": "legacy"},
    ],
    # Payment contribution arrangement (who pays) - NOT payment frequency.
    "mannerOfPayment": [
        {"value": "Subsidized", "label": "Subsidized", "src": "legacy"},
        {"value": "Contributory", "label": "Contributory", "src": "legacy"},
        {"value": "Salary Deduction", "label": "Salary Deduction", "src": "legacy"},
    ],
    "businessSource": [
        {"value": "Direct", "label": "Direct", "src": "legacy"},
        {"value": "Agent", "label": "Agent", "src": "legacy"},
        {"value": "Broker", "label": "Broker", "src": "legacy"},
    ],
    # Account Enrollment > Contract Info > Account Type (legacy classification).
    "legacyAccountType": [
        {"value": "HMO", "label": "HMO", "src": "legacy"},
        {"value": "TPA-PRINCIPAL ONLY", "label": "TPA-PRINCIPAL ONLY", "src": "legacy"},
        {"value": "None [Virgin Account]", "label": "None [Virgin Account]", "src": "legacy"},
        {"value": "Corporate [CP]", "label": "Corporate [CP]", "src": "legacy"},
    ],
    "specialStandard": [
        {"value": "Special Account", "label": "Special Account", "src": "legacy"},
        {"value": "Standard", "label": "Standard", "src": "legacy"},
    ],
    "vcAppExclusions": [
        {"value": v, "label": v, "src": "legacy"}
        for v in ["Laboratory", "Consultation", "Inpatient", "APE", "ECU", "Dental", "Medical Claim",
                  "Health Tips", "Health Events", "Health Tracker", "Fitness", "Let's Walk", "Online Games"]
    ],
    # Payment frequency (BR-17). Semi-annual is pending OQ-01.
    "paymentMode": [
        {"value": "Annual", "label": "Annual", "src": "proposed"},
        {"value": "Semi-annual", "label": "Semi-annual (pending confirmation)", "src": "pending"},
        {"value": "Quarterly", "label": "Quarterly", "src": "proposed"},
        {"value": "Monthly", "label": "Monthly", "src": "proposed"},
    ],
    "memberType": [
        {"value": "Principal", "label": "Principal", "src": "proposed"},
        {"value": "Dependent", "label": "Dependent", "src": "proposed"},
    ],
    # The following lists were NOT inventoried in HMS3. Demo values; replace from HMS3 masters.
    "planType": [
        {"value": "CORP-STD", "label": "CORP-STD - Corporate standard", "src": "demo"},
        {"value": "CORP-EXEC", "label": "CORP-EXEC - Corporate executive", "src": "demo"},
        {"value": "CORP-DEP", "label": "CORP-DEP - Corporate dependent", "src": "demo"},
    ],
    "roomType": [
        {"value": "Ward", "label": "Ward", "src": "demo"},
        {"value": "Semi-private", "label": "Semi-private", "src": "demo"},
        {"value": "Private", "label": "Private", "src": "demo"},
        {"value": "Suite", "label": "Suite", "src": "demo"},
    ],
    "civilStatus": [
        {"value": "Any", "label": "Any", "src": "demo"},
        {"value": "Single", "label": "Single", "src": "demo"},
        {"value": "Married", "label": "Married", "src": "demo"},
        {"value": "Widowed", "label": "Widowed", "src": "demo"},
        {"value": "Separated", "label": "Separated", "src": "demo"},
    ],
    "commissionType": [
        {"value": "Percentage of premium", "label": "Percentage of premium", "src": "demo"},
        {"value": "Percentage of net premium", "label": "Percentage of net premium", "src": "demo"},
        {"value": "None", "label": "None", "src": "demo"},
    ],
    "leadSource": [
        {"value": v, "label": v, "src": "proposed"}
        for v in ["Referral", "Networking", "Marketing campaign", "Cold call", "Email", "Internet inquiry", "Agent/Broker"]
    ],
    "department": [
        {"value": v, "label": v, "src": "demo"} for v in ["Corporate Sales", "Account Services", "Actuarial"]
    ],
    "relationship": [
        {"value": v, "label": v, "src": "demo"}
        for v in ["Principal", "Spouse", "Child", "Parent", "Sibling", "Domestic partner"]
    ],
    "lostReason": [
        {"value": v, "label": v, "src": "proposed"}
        for v in ["Price", "Benefits", "Stayed with incumbent", "Switched after signing", "Below corporate minimum (routed to IFG)", "Other"]
    ],
    "benefitCategory": [
        {"value": v, "label": v, "src": "proposed"}
        for v in ["Inpatient", "Outpatient", "Emergency", "Dental", "APE", "Maternity", "Preventive", "Add-on"]
    ],
    "limitType": [
        {"value": v, "label": v, "src": "proposed"}
        for v in ["% of MBL", "Fixed amount", "Per visit", "Per year", "Per illness", "As charged"]
    ],
    "frequency": [
        {"value": v, "label": v, "src": "proposed"}
        for v in ["Per confinement", "Per visit", "Per year", "Per illness", "Once a year", "Unlimited"]
    ],
    "targetDepartment": [
        {"value": v, "label": v, "src": "proposed"} for v in ["CCD", "MDA", "FDA", "B&C", "Provider Relations", "Wellness"]
    ],
    "channel": [
        {"value": v, "label": v, "src": "proposed"} for v in ["In-person", "Email", "Call", "Video call"]
    ],
    "commissionBasis": [
        {"value": "Premium", "label": "Premium", "src": "proposed"},
        {"value": "Net", "label": "Net", "src": "proposed"},
    ],
}

# Province -> cities, region. Demo subset of the Philippine geographic master.
GEO = {
    "Metro Manila": {"region": "NCR", "cities": ["Caloocan", "Las Piñas", "Makati", "Malabon", "Mandaluyong", "Manila", "Marikina", "Muntinlupa", "Navotas", "Parañaque", "Pasay", "Pasig", "Pateros", "Quezon City", "San Juan", "Taguig", "Valenzuela"]},
    "Bulacan": {"region": "Region III (Central Luzon)", "cities": ["Malolos", "Marilao", "Meycauayan", "San Jose del Monte"]},
    "Pampanga": {"region": "Region III (Central Luzon)", "cities": ["Angeles", "Mabalacat", "San Fernando"]},
    "Batangas": {"region": "Region IV-A (CALABARZON)", "cities": ["Batangas City", "Lipa", "Santo Tomas", "Tanauan"]},
    "Cavite": {"region": "Region IV-A (CALABARZON)", "cities": ["Bacoor", "Carmona", "Cavite City", "Dasmariñas", "General Trias", "Imus", "Silang", "Tagaytay", "Trece Martires"]},
    "Laguna": {"region": "Region IV-A (CALABARZON)", "cities": ["Biñan", "Cabuyao", "Calamba", "Los Baños", "San Pablo", "San Pedro", "Santa Rosa"]},
    "Rizal": {"region": "Region IV-A (CALABARZON)", "cities": ["Antipolo", "Binangonan", "Cainta", "Taytay"]},
    "Iloilo": {"region": "Region VI (Western Visayas)", "cities": ["Iloilo City", "Passi"]},
    "Negros Occidental": {"region": "Region VI (Western Visayas)", "cities": ["Bacolod", "Silay"]},
    "Cebu": {"region": "Region VII (Central Visayas)", "cities": ["Cebu City", "Lapu-Lapu", "Mandaue", "Talisay"]},
    "Misamis Oriental": {"region": "Region X (Northern Mindanao)", "cities": ["Cagayan de Oro", "Gingoog"]},
    "Davao del Sur": {"region": "Region XI (Davao Region)", "cities": ["Davao City", "Digos"]},
    "Benguet": {"region": "CAR (Cordillera)", "cities": ["Baguio", "La Trinidad"]},
}

INDUSTRIES = [
    # (code, name, highRisk)  - high-risk defaults per NB-FRN-03 (configurable)
    ("IND-01", "Business process outsourcing", False),
    ("IND-02", "Banking and financial services", False),
    ("IND-03", "Construction", True),
    ("IND-04", "Education", False),
    ("IND-05", "Government", True),
    ("IND-06", "Healthcare", False),
    ("IND-07", "Hospitality and food service", False),
    ("IND-08", "Information technology", False),
    ("IND-09", "Logistics and shipping", False),
    ("IND-10", "Manufacturing", False),
    ("IND-11", "Mining", True),
    ("IND-12", "Real estate", False),
    ("IND-13", "Retail", False),
    ("IND-14", "Telecommunications", False),
    ("IND-15", "Utilities and energy", False),
    ("IND-16", "Agriculture", False),
    ("IND-17", "Professional services", False),
    ("IND-18", "Non-profit", False),
]

# Benefit library (NB-SOB-01). Demo content; Actuarial owns the template in production.
BENEFIT_LIBRARY = [
    ("IP-RB", "Inpatient", "Room and board", "Room and board", "As charged"),
    ("IP-HOSP", "Inpatient", "Hospital charges", "Hospital charges", "% of MBL"),
    ("IP-PF", "Inpatient", "Professional fees", "Professional fees", "% of MBL"),
    ("IP-ICU", "Inpatient", "Hospital charges", "ICU / critical care", "% of MBL"),
    ("IP-SURG", "Inpatient", "Professional fees", "Surgical fees", "% of MBL"),
    ("OP-CONS", "Outpatient", "Consultation", "Specialist consultation", "Per visit"),
    ("OP-LAB", "Outpatient", "Diagnostics", "Laboratory and diagnostics", "Per year"),
    ("OP-XRAY", "Outpatient", "Diagnostics", "Imaging (X-ray, ultrasound)", "Per year"),
    ("OP-CTMRI", "Outpatient", "Diagnostics", "CT scan / MRI", "Per illness"),
    ("OP-PT", "Outpatient", "Therapy", "Physical therapy", "Per year"),
    ("OP-MED", "Outpatient", "Medicines", "Take-home medicines", "Fixed amount"),
    ("ER-ACC", "Emergency", "Emergency care", "Accredited hospital emergency", "% of MBL"),
    ("ER-NONACC", "Emergency", "Emergency care", "Non-accredited hospital emergency", "Fixed amount"),
    ("ER-AMB", "Emergency", "Transport", "Ambulance service", "Per illness"),
    ("DEN-PREV", "Dental", "Preventive dental", "Oral prophylaxis", "Once a year"),
    ("DEN-EXT", "Dental", "Basic dental", "Simple tooth extraction", "Per year"),
    ("DEN-FILL", "Dental", "Basic dental", "Temporary fillings", "Per year"),
    ("APE-STD", "APE", "Annual physical exam", "Standard APE package", "Once a year"),
    ("APE-EXEC", "APE", "Annual physical exam", "Executive APE package", "Once a year"),
    ("MAT-NSD", "Maternity", "Delivery", "Normal delivery", "Fixed amount"),
    ("MAT-CS", "Maternity", "Delivery", "Caesarean section", "Fixed amount"),
    ("MAT-PRE", "Maternity", "Prenatal", "Prenatal consultations", "Per visit"),
    ("PREV-IMM", "Preventive", "Immunization", "Flu vaccination", "Once a year"),
    ("PREV-WELL", "Preventive", "Wellness", "Health benefit orientation", "Once a year"),
    ("ADD-LIFE", "Add-on", "Life insurance", "Group life insurance (partner)", "Fixed amount"),
    ("ADD-TELE", "Add-on", "Teleconsultation", "Teleconsultation (Consulta MD)", "Unlimited"),
]

STANDARD_EXCLUSIONS = [
    "Cosmetic surgery and aesthetic procedures",
    "Self-inflicted injuries",
    "Injuries from participation in riots or war",
    "Experimental treatment",
    "Congenital conditions beyond policy terms",
    "Custodial care and rest cures",
]

# Onboarding checklist (NB-ONB-05). Mandatory flags are PENDING OQ-02.
ONBOARDING_CHECKLIST = [
    {"key": "kyc_form", "label": "KYC form", "mandatory": True},
    {"key": "gis", "label": "General Information Sheet (GIS)", "mandatory": True},
    {"key": "sec_registration", "label": "SEC / DTI registration", "mandatory": True},
    {"key": "signatory_id", "label": "Authorized signatory ID", "mandatory": True},
    {"key": "bir_cert", "label": "BIR certificate (VAT status evidence)", "mandatory": False},
    {"key": "board_resolution", "label": "Board resolution / secretary's certificate", "mandatory": False},
    {"key": "mayors_permit", "label": "Mayor's / business permit", "mandatory": False},
]

# Franchise attachment slots. Legacy slots verified; extras are configurable.
FRANCHISE_DOCS = [
    {"key": "aor_bor", "label": "AOR/BOR", "src": "legacy", "requiredWhen": "intermediary"},
    {"key": "signatory_id", "label": "Signatory ID", "src": "legacy", "requiredWhen": None},
    {"key": "masterlist", "label": "Member Data (Master List)", "src": "legacy", "requiredWhen": None},
    {"key": "tor", "label": "TOR", "src": "legacy", "requiredWhen": None},
    {"key": "utilization", "label": "Utilization", "src": "legacy", "requiredWhen": None},
    {"key": "gis", "label": "GIS (additional requirement)", "src": "proposed", "requiredWhen": None},
]

# Franchise requirements checklist for quotation (NB-FRN-10)
REQUIREMENTS = [
    {"key": "masterlist", "label": "Member Data (Master List)"},
    {"key": "tor", "label": "TOR / current SOB"},
    {"key": "utilization", "label": "Utilization report"},
    {"key": "target_rates", "label": "Target rates"},
    {"key": "gis", "label": "GIS"},
]

# Contract lifecycle. Source: AAT requests the contract; LEGAL prepares and
# reviews the draft; AMT endorses the Contract/DSA to the client, retrieves and
# notarizes it, and sends the notarized copy.
CONTRACT_STEPS = [
    {"key": "Requested", "role": "aat"},
    {"key": "Drafting", "role": "legal"},
    {"key": "Review", "role": "legal"},
    {"key": "Endorsed", "role": "amt"},
    {"key": "Client signed", "role": "amt", "doc": "signed"},
    {"key": "Notarized", "role": "amt", "doc": "notarized"},
    {"key": "Sent to client", "role": "amt"},
    {"key": "Completed", "role": "amt"},
]

# Downstream teams that acknowledge an account handover. Named only collectively
# in the source ("internal alignment with VC departments"), so ownership is left
# unconfirmed. Wellness has no login in this prototype's scope; AMT retains the
# documented health-benefit-orientation participation elsewhere.
HANDOVER_TEAMS = [
    {"key": "mda", "label": "MDA (internal alignment)", "role": "mda"},
    {"key": "bc", "label": "B&C (internal alignment)", "role": "bc"},
    {"key": "ccd", "label": "CCD (downstream)", "role": "ccd"},
]

# ---------------------------------------------------------------- configuration
# Unresolved rules live here; admins can change them in More > Configuration.
DEFAULT_CONFIG = {
    "corporateMinPrincipals": {"value": 20, "src": "proposed", "note": "BR-01 / NB-FRN-02"},
    "franchiseValidityIntermediaryDays": {"value": 60, "src": "proposed", "note": "NB-FRN-06"},
    "franchiseValidityDirectRule": {"value": "calendar_year", "src": "pending", "note": "OQ-09: calendar year (to 31 Dec) or 12 months from approval",
                                     "options": ["calendar_year", "twelve_months"]},
    "franchiseExpiryReminderDays": {"value": 7, "src": "proposed", "note": "NB-FRN-09"},
    "proposalValidityDays": {"value": 60, "src": "proposed", "note": "BR-08"},
    "highRiskIndustries": {"value": ["IND-03", "IND-05", "IND-11"], "src": "proposed", "note": "BR-07"},
    "duplicateOverrideRoles": {"value": ["aat", "amt"], "src": "pending", "note": "Who may create a separate company despite a possible duplicate (handlers; source does not name an override owner)"},
    "waiverRoles": {"value": ["amt"], "src": "pending", "note": "OQ-02: who may approve onboarding document waivers (source silent; AMT placeholder, configurable)"},
    "allowMandatoryWaiver": {"value": False, "src": "pending", "note": "OQ-02: may mandatory onboarding documents be waived"},
    "kycRequiredForAccount": {"value": True, "src": "proposed", "note": "To-be step 12: KYC completed before account number"},
    "accountGateContractStep": {"value": "Completed", "src": "pending", "note": "NB-ONB-03 says Completed/Signed; BR-12 says signed and closed",
                                "options": ["Client signed", "Notarized", "Completed"]},
    "sobValidatorRoles": {"value": ["approver"], "src": "pending", "note": "US-SOB-04: independent second function; source does not name the role, so routed to the pending-confirmation approver"},
    "vatModel": {"value": "manual", "src": "pending", "note": "OQ-03 / audit: Before VAT / VAT Inclusive / VAT amount meaning unverified. 'manual' = no formula",
                 "options": ["manual", "check_12pct"]},
    "decouplePaymentMode": {"value": False, "src": "pending", "note": "OQ-05 / NB-PLN-07: payment mode outside Plan Code identity"},
    "partnerCompat": {"value": "map", "src": "pending", "note": "Legacy 'If Grepa' field retained and mapped, never overwritten; Full Life mapping unconfirmed",
                      "options": ["map"]},
    "seniorApprovalAlways": {"value": True, "src": "proposed", "note": "BR-09: every account needs a sign-off; the approving title is not named in the source (see activationOwnerRoles / pricingApprovalRoles)"},
    # ---- Owners the two source documents do NOT name. Each step stays visible but
    # its owner is routed to a pending-confirmation participant and is configurable
    # here. Any demo action on these is a simulation, never an assumed production right.
    "pricingApprovalRoles": {"value": ["approver"], "src": "pending", "note": "Actuarial 1st/2nd-level quotation approval; source shows the steps but not the approving titles"},
    "activationOwnerRoles": {"value": ["approver"], "src": "pending", "note": "Final account activation / go-live owner is not named in either source"},
    "memberEnrollmentRoles": {"value": ["mda"], "src": "pending", "note": "Member Data loading/enrolment; named only collectively as internal alignment"},
    "billingOwnerRoles": {"value": ["bc"], "src": "pending", "note": "Billing setup owner; B&C named only collectively as internal alignment"},
    "orientationRoles": {"value": ["amt"], "src": "proposed", "note": "AMT participates in health-benefit orientation (source-confirmed); Wellness has no login in this build"},
    "handoverAckRoles": {"value": ["mda", "bc", "ccd"], "src": "pending", "note": "Downstream handover acknowledgers; named only collectively"},
    "sessionMinutes": {"value": 480, "src": "demo", "note": "Session expiry (set low to test session-expiry recovery)"},
    "tatDays": {"value": {
        "franchise_submit": 1, "franchise_review": 1, "requirements": 1, "rate_request": 1, "rate_sheet": 3,
        "proposal": 4, "pricing_review": 1, "senior_approval": 1, "client_decision": 10, "contract_legal": 5,
        "contract_endorse": 3, "contract_notarize": 5, "contract_send": 1, "kyc": 3, "account_create": 2,
        "account_approve": 1, "sob": 3, "sob_review": 1, "sob_validate": 2, "codify": 1, "plan_codes": 2,
        "plan_approve": 1, "coc": 1, "commission": 1, "member_data": 3, "mda": 3, "billing": 3, "orientation": 5,
        "activation": 1, "handover": 2, "alignment": 1,
    }, "src": "proposed", "note": "Section 4.1 TATs, working days"},
    "pipelineStages": {"value": ["New", "Qualified", "Franchised", "For Rates Creation", "Proposal Sent", "Negotiation",
                                  "For Approval", "Contract", "Closed Won", "Closed Lost"], "src": "proposed", "note": "NB-LEAD-03"},
    "maCodePattern": {"value": "MA-{year}-{seq:05d}", "src": "pending", "note": "Legacy MA Code format not inventoried"},
    "maxUploadMB": {"value": 25, "src": "proposed", "note": "NB-DOC-03"},
    "allowedUploadTypes": {"value": ["pdf", "xlsx", "xls", "csv", "docx", "jpg", "jpeg", "png"], "src": "proposed", "note": "NB-DOC-03 (+CSV for imports)"},
    "memberAgeLimits": {"value": {"principalMin": 18, "principalMax": 65, "childMax": 21, "parentMax": 65}, "src": "pending", "note": "Eligibility ages not confirmed"},
}


def franchise_schema():
    """Franchise form - four familiar legacy sections. Required flags are this
    build's assumption (HMS3 required markers were not inventoried)."""
    S = lambda key, label, type="text", **kw: dict(key=key, label=label, type=type, **kw)
    return [
        {"key": "accountInfo", "label": "Account Information", "fields": [
            S("accountType", "Account Type", "select", options="franchiseAccountType", required=True, src="legacy",
              help="Product: CORPORATE/HMO (insured) or TPA/ASO (client-funded)."),
            S("name", "Name", required=True, src="legacy", help="Registered company name."),
            S("natureOfBusiness", "Nature of Business", "industry", required=True, src="legacy"),
            S("companyAddress", "Company Address", required=True, src="legacy", wide=True),
            S("companyProvince", "Company Province", "province", required=True, src="legacy", group="company"),
            S("companyCity", "Company City", "city", required=True, src="legacy", group="company"),
            S("companyRegion", "Company Region", "region", src="legacy", group="company"),
            S("sameAsCompany", "Same as Company Address", "checkbox", src="legacy", wide=True),
            S("billingAddress", "Billing Address", required=True, src="legacy", wide=True),
            S("billingProvince", "Billing Province", "province", required=True, src="legacy", group="billing"),
            S("billingCity", "Billing City", "city", required=True, src="legacy", group="billing"),
            S("billingRegion", "Billing Region", "region", src="legacy", group="billing"),
            S("shortName", "Short Name", src="legacy"),
            S("email", "Email", "email", required=True, src="legacy"),
            S("telephone", "Telephone", "tel", src="legacy"),
            S("facsimile", "Facsimile", "tel", src="legacy"),
            S("contactPerson", "Contact Person", required=True, src="legacy"),
            S("contactPosition", "Contact Position", src="legacy"),
            S("contactNumber", "Contact Number", "tel", required=True, src="legacy"),
            S("proposalAddressee", "Proposal Addressee", src="legacy"),
            S("addresseePosition", "Addressee Position", src="legacy"),
            S("addresseeContactNumber", "Addressee Contact Number", "tel", src="legacy"),
            S("tin", "TIN", src="proposed", help="Used for duplicate and conflict checks (NB-LEAD-02)."),
        ]},
        {"key": "otherInfo", "label": "Other Information", "fields": [
            S("employeeCount", "No. of Employees (principals)", "int", required=True, src="legacy"),
            S("dependentCount", "No. of Dependents", "int", src="legacy"),
            S("totalCount", "Total", "total", src="legacy", help="Calculated: principals + dependents."),
            S("vatStatus", "VAT Status", "select", options="vatStatus", required=True, src="legacy"),
            S("currentCoverage", "Current Coverage", "select", options="currentCoverage", required=True, src="legacy"),
            S("mannerOfEnrollment", "Manner of Enrollment", "select", options="mannerOfEnrollment", required=True, src="legacy"),
            S("mannerOfPayment", "Manner of Payment", "select", options="mannerOfPayment", required=True, src="legacy",
              help="Contribution arrangement (who pays). Payment frequency is captured separately."),
            S("requestedBy", "Requested By", src="legacy"),
            S("department", "Department", "select", options="department", src="legacy"),
            S("businessSource", "Business Source", "select", options="businessSource", required=True, src="legacy"),
            S("commissionType", "Commission Type", "select", options="commissionType", src="legacy", requiredWhen="intermediary"),
            S("businessSourceName", "Name of Business Source", "intermediary", src="legacy", requiredWhen="intermediary",
              help="Only active, verified agents/brokers of the selected type can be chosen."),
            S("createdBy", "Created By", "readonly", src="legacy"),
            S("accountManager", "Account handler (AAT)", "user:aat", required=True, src="legacy"),
            S("salesManager", "Secondary handler (AAT)", "user:aat", required=True, src="legacy",
              help="Second AAT handler for this account. (Source does not confirm a separate Sales/Team Manager role.)"),
            S("currentHmoProvider", "Current HMO provider", src="proposed"),
            S("currentContractExpiry", "Current contract expiry", "date", src="proposed"),
            S("targetEffectiveDate", "Target effective date", "date", src="proposed"),
            S("salesRemarks", "Sales Remarks", "textarea", src="legacy", wide=True),
            S("acusaRemarks", "Actuarial Remarks", "textarea", src="legacy", wide=True, editRoles=["accusa", "amt"],
              help="Entered by Actuarial or AMT."),
        ]},
    ]


def affiliate_fields():
    return [
        {"key": "name", "label": "Name", "type": "text", "required": True, "src": "legacy"},
        {"key": "address", "label": "Address", "type": "text", "src": "legacy"},
        {"key": "email", "label": "Email", "type": "email", "src": "legacy"},
        {"key": "contactPerson", "label": "Contact Person", "type": "text", "src": "legacy"},
        {"key": "contactNumber", "label": "Contact Number", "type": "tel", "src": "legacy"},
        {"key": "financialAssistance", "label": "Financial Assistance", "type": "text", "src": "legacy"},
        {"key": "financialAssistanceName", "label": "Financial Assistance Name", "type": "text", "src": "legacy"},
    ]


def account_schema():
    """Account Enrollment (New) - six legacy tabs mapped to grouped sections."""
    S = lambda key, label, type="text", **kw: dict(key=key, label=label, type=type, **kw)
    return [
        {"key": "accountInfo", "label": "Account Info", "fields": [
            S("maCode", "MA Code", "readonly", src="legacy"),
            S("accountCode", "Account Code", "readonly", src="legacy"),
            S("mainName", "Main Name", "readonly", src="legacy"),
            S("accountName", "Account Name (registered)", required=True, src="legacy"),
            S("shortName", "Short / trade name", src="legacy"),
            S("tin", "TIN", required=True, src="legacy"),
            S("vatStatus", "VAT Status", "select", options="vatStatus", required=True, src="legacy"),
            S("currentCoverage", "Current Coverage", "select", options="currentCoverage", src="legacy"),
            S("noOfEnrolees", "No. of Enrolees", "int", src="legacy"),
            S("noOfDependents", "No. of Dependent", "int", src="legacy"),
            S("address", "Address", required=True, src="legacy", wide=True),
            S("province", "Province", "province", src="legacy", group="company"),
            S("city", "City", "city", src="legacy", group="company"),
            S("region", "Region", "region", src="legacy", group="company"),
            S("billingAddress", "Billing address", src="legacy", wide=True),
            S("contactPerson", "Contact Person", required=True, src="legacy"),
            S("mobile", "Mobile Num", "tel", src="legacy"),
            S("telNo", "Tel No", "tel", src="legacy"),
            S("contactEmail", "Contact Email", "email", src="legacy"),
        ]},
        {"key": "contractInfo", "label": "Contract Info", "fields": [
            S("specialStandard", "Special Account/Standard", "select", options="specialStandard", required=True, src="legacy"),
            S("legacyAccountType", "Account Type (legacy classification)", "select", options="legacyAccountType", required=True, src="legacy",
              help="Legacy classification. Product and business source are separate fields."),
            S("product", "Product", "select", options="franchiseAccountType", required=True, src="proposed"),
            S("effectivityDate", "Effectivity Date", "date", required=True, src="legacy"),
            S("expiryDate", "Expiry Date", "date", required=True, src="legacy"),
            S("paymentMode", "Payment mode (frequency)", "select", options="paymentMode", required=True, src="proposed"),
            S("paymentTerms", "Payment terms", src="proposed", help="Default T+30 (BR-15)."),
            S("mannerOfEnrollment", "Manner of Enrollment", "select", options="mannerOfEnrollment", src="legacy"),
            S("mannerOfPayment", "Manner of Payment (contribution)", "select", options="mannerOfPayment", src="legacy"),
            S("payType", "Pay type", src="legacy", help="Option list not yet inventoried from HMS3 - free entry."),
            S("reimbursementDays", "Reimb # of Days", "int", src="legacy"),
            S("insurance", "Insurance", src="legacy", help="Option list not yet inventoried from HMS3 - free entry."),
            S("preExisting", "Pre-existing", src="legacy"),
            S("dentalRate", "Dental-Rate", "money", src="legacy"),
            S("billCutoff", "Bill Cut Off", src="legacy"),
        ]},
        {"key": "agentInfo", "label": "Agent Info", "fields": [
            S("businessSource", "Business Source", "select", options="businessSource", required=True, src="legacy"),
            S("agent", "Agent / Broker", "intermediary", src="legacy", requiredWhen="intermediary"),
            S("contactPerson", "Contact Person", src="legacy"),
            S("telephone1", "Telephone (1)", "tel", src="legacy"),
            S("cellphone1", "CellPhone (1)", "tel", src="legacy"),
            S("primaryEmail", "Primary Email", "email", src="legacy"),
            S("telephone2", "Telephone (2)", "tel", src="legacy"),
            S("cellphone2", "CellPhone (2)", "tel", src="legacy"),
            S("secondaryEmail", "Secondary Email", "email", src="legacy"),
        ]},
        {"key": "otherInfo", "label": "Other Info", "fields": [
            S("financialAssistance", "Financial Assistance", src="legacy"),
            S("extension", "Extension (optional)", src="legacy"),
            S("adminFee", "Admin Fee (optional)", "money", src="legacy"),
            S("naturalDeathAmount", "Natural Death Amount", "money", src="legacy"),
            S("accidentalDeathAmount", "Accidental Death Amount", "money", src="legacy"),
            S("dismembermentAmount", "Dismemberment Amount", "money", src="legacy"),
            S("accountManager", "Account handler (AAT)", "user:aat", required=True, src="proposed"),
            S("vip", "VIP account", "checkbox", src="proposed"),
            S("vipReason", "VIP reason", src="proposed"),
            S("jumbo", "Jumbo account", "checkbox", src="proposed"),
            S("lifeInsurance", "Life insurance add-on (Full Life)", "checkbox", src="proposed"),
            S("teleconsultation", "Teleconsultation add-on (Consulta MD)", "checkbox", src="proposed"),
            S("vcLinkAccess", "VC Link / DC Management portal access", "checkbox", src="proposed"),
            S("remarks", "Remarks", "textarea", src="legacy", wide=True),
            S("notes", "Notes", "textarea", src="legacy", wide=True),
        ]},
    ]


PLAN_CODE_FIELDS = [
    # key, label, type, required, src, group
    ("planCode", "Plan Code", "readonly", False, "legacy", "Identity"),
    ("accountId", "Account / affiliate", "account", True, "legacy", "Identity"),
    ("sobVersion", "SOB version", "readonly", False, "proposed", "Identity"),
    ("planType", "Plan Type", "select:planType", True, "legacy", "Plan"),
    ("mbl", "MBL", "money", True, "legacy", "Plan"),
    ("mblDescription", "MBL description", "text", False, "legacy", "Plan"),
    ("businessSource", "Business Source", "select:businessSource", True, "legacy", "Plan"),
    ("roomType", "Room Type", "select:roomType", True, "legacy", "Plan"),
    ("roomLimit", "Room Limit (per-day room rate)", "money", False, "legacy", "Plan"),
    ("modeOfPayment", "Mode of Payment", "select:paymentMode", True, "legacy", "Plan"),
    ("memberType", "Member Type", "select:memberType", True, "legacy", "Eligibility"),
    ("principalPosition", "Principal Position", "text", False, "legacy", "Eligibility"),
    ("civilStatus", "Civil Status", "select:civilStatus", False, "legacy", "Eligibility"),
    ("beforeVat", "Before VAT", "money", True, "legacy", "Pricing"),
    ("vatInclusive", "VAT Inclusive", "checkbox", False, "legacy", "Pricing"),
    ("vatAmount", "VAT amount", "money", False, "legacy", "Pricing"),
    ("vatDesc", "VAT Desc.", "text", True, "legacy", "Pricing"),
    ("premium", "Premium", "money", False, "legacy", "Pricing"),
    ("hospitalCodes", "Hospital Code", "providers:H", True, "legacy", "Providers"),
    ("clinicCodes", "Clinic Code", "providers:C", True, "legacy", "Providers"),
    ("remarks", "Remarks", "text", True, "legacy", "Remarks"),
    ("dentalRemarks", "Dental Remarks", "text", True, "legacy", "Remarks"),
    ("contractYear", "Contract Year", "int", True, "legacy", "Dates"),
    ("effectiveFrom", "Effective from", "date", True, "proposed", "Dates"),
    ("effectiveTo", "Effective to", "date", False, "proposed", "Dates"),
]

MEMBER_COLUMNS = [
    # key, label, required
    ("employeeId", "Employee ID", True),
    ("lastName", "Last Name", True),
    ("firstName", "First Name", True),
    ("middleName", "Middle Name", False),
    ("birthDate", "Birth Date", True),
    ("gender", "Gender", True),
    ("civilStatus", "Civil Status", True),
    ("memberType", "Member Type", True),
    ("relationship", "Relationship", True),
    ("principalEmployeeId", "Principal Employee ID", False),
    ("designation", "Designation", False),
    ("plan", "Plan Code", False),
    ("effectiveDate", "Effective Date", False),
    ("affiliate", "Affiliate", False),
]

RATE_SHEET_COLUMNS = ["plan", "roomBoard", "mbl", "memberType", "ageBand", "paymentMode", "rate"]


def options_payload():
    return {
        "roles": ROLES,
        "users": USERS,
        "stages": STAGES,
        "options": OPTIONS,
        "geo": GEO,
        "industries": [{"code": c, "name": n, "highRisk": h} for c, n, h in INDUSTRIES],
        "benefitLibrary": [{"code": c, "category": cat, "service": svc, "subcategory": sub, "limitType": lt}
                           for c, cat, svc, sub, lt in BENEFIT_LIBRARY],
        "standardExclusions": STANDARD_EXCLUSIONS,
        "franchiseSchema": franchise_schema(),
        "affiliateFields": affiliate_fields(),
        "accountSchema": account_schema(),
        "planCodeFields": [dict(key=k, label=l, type=t, required=r, src=s, group=g) for k, l, t, r, s, g in PLAN_CODE_FIELDS],
        "memberColumns": [dict(key=k, label=l, required=r) for k, l, r in MEMBER_COLUMNS],
        "rateSheetColumns": RATE_SHEET_COLUMNS,
        "franchiseDocs": FRANCHISE_DOCS,
        "requirements": REQUIREMENTS,
        "onboardingChecklist": ONBOARDING_CHECKLIST,
        "contractSteps": CONTRACT_STEPS,
        "handoverTeams": HANDOVER_TEAMS,
    }
