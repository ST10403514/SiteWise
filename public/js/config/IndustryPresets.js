'use strict';

/**
 * IndustryPresets - the tenant-configurable heart of SiteWise.
 *
 * Each business picks an industry at onboarding, which drives the
 * job-type and method chips in the app and on generated PDFs.
 * Colour schemes theme the whole app UI *and* PDF branding.
 */
const IndustryPresets = {
  industries: {
    painting: {
      label: 'Painting & Decorating',
      jobTypes: {
        interior: 'Interior painting', exterior: 'Exterior painting',
        roof: 'Roof painting', waterproofing: 'Waterproofing',
        damp: 'Damp proofing', plaster: 'Plaster repair',
        wood: 'Wood treatment', access: 'High-access painting',
      },
      methods: {
        pressure: 'High-pressure cleaning', scrape: 'Scraping & sanding',
        crack: 'Crack filling', patch: 'Plaster patching', prime: 'Priming',
        twocoat: 'Two-coat application', spray: 'Spray application',
        roller: 'Roller & brush', torchon: 'Torch-on membrane',
        acrylic: 'Acrylic waterproofing', rope: 'Rope access', scaffold: 'Scaffolding',
      },
    },
    plumbing: {
      label: 'Plumbing',
      jobTypes: {
        leak: 'Leak detection', geyser: 'Geyser install / repair',
        drain: 'Drain unblocking', bathroom: 'Bathroom plumbing',
        kitchen: 'Kitchen plumbing', burst: 'Burst pipe repair',
        solar: 'Solar / heat pump', maint: 'Maintenance contract',
      },
      methods: {
        cctv: 'CCTV drain inspection', pressuretest: 'Pressure testing',
        jetting: 'Rodding & jetting', relining: 'Pipe relining',
        solder: 'Soldering & brazing', compression: 'Compression fittings',
        valve: 'Valve replacement', thermostat: 'Thermostat replacement',
        repipe: 'Re-piping', sealing: 'Leak sealing',
      },
    },
    electrical: {
      label: 'Electrical',
      jobTypes: {
        install: 'New installation', rewire: 'Rewiring', fault: 'Fault finding',
        db: 'DB board upgrade', lighting: 'Lighting', solar: 'Solar & backup power',
        coc: 'CoC inspection', maint: 'Maintenance',
      },
      methods: {
        circuit: 'Circuit testing', thermal: 'Thermal scanning',
        earth: 'Earth leakage testing', cable: 'Cable pulling',
        trunking: 'Trunking & conduit', dbwire: 'DB rewire', led: 'LED retrofit',
        inverter: 'Inverter installation', surge: 'Surge protection',
        cert: 'Certificate of Compliance',
      },
    },
    roofing: {
      label: 'Roofing & Waterproofing',
      jobTypes: {
        inspect: 'Roof inspection', leak: 'Leak repair', reroof: 'Re-roofing',
        waterproof: 'Waterproofing', gutter: 'Gutter installation',
        paint: 'Roof painting', structural: 'Structural repair', skylight: 'Skylights',
      },
      methods: {
        torchon: 'Torch-on membrane', acrylic: 'Acrylic waterproofing',
        flashing: 'Flashing replacement', tile: 'Tile replacement',
        ridge: 'Ridge capping', rope: 'Rope access',
        pressure: 'High-pressure cleaning', sealant: 'Sealant application',
        timber: 'Timber treatment', sheet: 'Sheet replacement',
      },
    },
    building: {
      label: 'Building & Renovations',
      jobTypes: {
        reno: 'Renovations', extension: 'Extensions', bathroom: 'Bathroom remodel',
        kitchen: 'Kitchen remodel', paving: 'Paving', walls: 'Boundary walls',
        plaster: 'Plastering', tiling: 'Tiling',
      },
      methods: {
        demo: 'Demolition', brick: 'Brickwork', concrete: 'Shuttering & concrete',
        screed: 'Screeding', plaster: 'Plastering', tiling: 'Tiling',
        damp: 'Damp proofing', finish: 'Painting & finishing',
        waterproof: 'Waterproofing', clearing: 'Site clearing',
      },
    },
    hvac: {
      label: 'HVAC & Refrigeration',
      jobTypes: {
        acinstall: 'AC installation', acservice: 'AC service',
        fridge: 'Refrigeration', vent: 'Ventilation', heatpump: 'Heat pumps',
        coldroom: 'Cold rooms', maint: 'Maintenance contract', callout: 'Fault callout',
      },
      methods: {
        regas: 'Re-gassing', leaktest: 'Leak testing', coil: 'Coil cleaning',
        filter: 'Filter replacement', duct: 'Ducting installation',
        compressor: 'Compressor replacement', calib: 'Thermostat calibration',
        braze: 'Brazing', vacuum: 'Vacuum & charge', electest: 'Electrical testing',
      },
    },
    landscaping: {
      label: 'Landscaping',
      jobTypes: {
        design: 'Garden design', lawn: 'Lawn installation', irrigation: 'Irrigation',
        tree: 'Tree felling', paving: 'Paving & pathways', fencing: 'Fencing',
        maint: 'Garden maintenance', lighting: 'Garden lighting',
      },
      methods: {
        prep: 'Site preparation', soil: 'Soil conditioning', turf: 'Turf laying',
        drip: 'Drip irrigation', sprinkler: 'Sprinkler systems',
        prune: 'Pruning & shaping', stump: 'Stump grinding', deck: 'Decking',
        plant: 'Planting', mulch: 'Mulching',
      },
    },
    it: {
      label: 'IT & Networking',
      jobTypes: {
        support: 'IT support callout', network: 'Network setup',
        wifi: 'WiFi & coverage', server: 'Server / NAS',
        cctv: 'CCTV & access control', backup: 'Backup & recovery',
        cloud: 'Cloud & email', security: 'Cybersecurity',
      },
      methods: {
        diagnostics: 'Diagnostics & triage', cabling: 'Structured cabling',
        router: 'Router / firewall config', ap: 'Access point install',
        switch: 'Switch configuration', imaging: 'Device imaging & setup',
        migration: 'Data migration', patching: 'Updates & patching',
        antivirus: 'Antivirus & hardening', remote: 'Remote monitoring setup',
      },
    },
    security: {
      label: 'Security & CCTV',
      jobTypes: {
        cctv: 'CCTV installation', alarm: 'Alarm system', access: 'Access control',
        electric: 'Electric fencing', intercom: 'Intercom / gate',
        monitor: 'Monitoring setup', service: 'Service & repair', audit: 'Security audit',
      },
      methods: {
        camera: 'Camera mounting & aiming', nvr: 'NVR / DVR setup',
        cabling: 'Cabling & trunking', sensor: 'Sensor placement',
        keypad: 'Keypad & reader install', energizer: 'Fence energizer setup',
        signal: 'Signal & network test', remote: 'Remote view setup',
        battery: 'Battery & backup', handover: 'Client handover & training',
      },
    },
    appliance: {
      label: 'Appliance Repair',
      jobTypes: {
        washing: 'Washing machine', fridge: 'Fridge / freezer',
        oven: 'Oven / stove', dishwasher: 'Dishwasher',
        dryer: 'Tumble dryer', microwave: 'Microwave',
        smallappliance: 'Small appliances', callout: 'Diagnostic callout',
      },
      methods: {
        diagnose: 'Fault diagnosis', element: 'Element replacement',
        motor: 'Motor / pump replacement', thermostat: 'Thermostat replacement',
        seal: 'Seal & gasket replacement', board: 'Control board repair',
        belt: 'Belt replacement', regas: 'Re-gassing',
        clean: 'Deep clean & service', wiring: 'Wiring repair',
      },
    },
    pest: {
      label: 'Pest Control',
      jobTypes: {
        general: 'General pest treatment', rodent: 'Rodent control',
        termite: 'Termite / borer', cockroach: 'Cockroach treatment',
        bees: 'Bee / wasp removal', fumigation: 'Fumigation',
        birdproofing: 'Bird proofing', inspection: 'Inspection & report',
      },
      methods: {
        inspect: 'Site inspection', bait: 'Baiting stations',
        spray: 'Residual spraying', gel: 'Gel application',
        fog: 'Fogging / misting', dust: 'Dusting treatment',
        seal: 'Entry-point sealing', trap: 'Trapping',
        soil: 'Soil poisoning', followup: 'Follow-up scheduling',
      },
    },
    solar: {
      label: 'Solar & Renewables',
      jobTypes: {
        grid: 'Grid-tied system', hybrid: 'Hybrid system',
        offgrid: 'Off-grid system', backup: 'Backup / UPS',
        geyser: 'Solar geyser', battery: 'Battery expansion',
        service: 'Service & repair', assessment: 'Site assessment',
      },
      methods: {
        panel: 'Panel mounting', inverter: 'Inverter installation',
        batterybank: 'Battery bank wiring', mppt: 'MPPT / charge controller',
        db: 'DB & changeover', earthing: 'Earthing & lightning',
        monitoring: 'Monitoring setup', commissioning: 'Commissioning & test',
        coc: 'Certificate of Compliance', loadtest: 'Load & backup test',
      },
    },
    flooring: {
      label: 'Flooring',
      jobTypes: {
        laminate: 'Laminate', vinyl: 'Vinyl / LVT', tiles: 'Tiling',
        carpet: 'Carpeting', wood: 'Solid wood', screed: 'Screeding',
        epoxy: 'Epoxy / industrial', restore: 'Restoration',
      },
      methods: {
        prep: 'Surface preparation', level: 'Self-levelling',
        moisture: 'Moisture testing', underlay: 'Underlay install',
        adhesive: 'Adhesive application', cut: 'Cutting & fitting',
        grout: 'Grouting & sealing', sand: 'Sanding & sealing',
        skirting: 'Skirting & trims', polish: 'Polishing',
      },
    },
    glazing: {
      label: 'Glazing & Aluminium',
      jobTypes: {
        windows: 'Windows', doors: 'Doors', shopfront: 'Shopfronts',
        shower: 'Shower enclosures', mirror: 'Mirrors', balustrade: 'Balustrades',
        repair: 'Glass repair', screens: 'Screens & sliders',
      },
      methods: {
        measure: 'Measure & template', remove: 'Removal of old units',
        frame: 'Frame installation', glass: 'Glass cutting & fitting',
        seal: 'Sealing & silicone', beading: 'Beading & gaskets',
        hinge: 'Hinges & rollers', lock: 'Locks & handles',
        align: 'Alignment & adjustment', safety: 'Safety-glass compliance',
      },
    },
    automotive: {
      label: 'Automotive & Mechanical',
      jobTypes: {
        service: 'Service', diagnostic: 'Diagnostics', brakes: 'Brakes',
        engine: 'Engine repair', suspension: 'Suspension', electrical: 'Auto electrical',
        aircon: 'Auto air-con', tyres: 'Tyres & alignment',
      },
      methods: {
        scan: 'OBD diagnostic scan', oil: 'Oil & filter change',
        pad: 'Brake pad / disc', fluid: 'Fluid flush & top-up',
        belt: 'Belt & timing', battery: 'Battery & charging test',
        suspension: 'Suspension & shocks', regas: 'Air-con re-gas',
        balance: 'Wheel balance & align', roadtest: 'Road test',
      },
    },
    general: {
      label: 'General / Other trades',
      jobTypes: {
        inspection: 'Inspection', repair: 'Repair', install: 'Installation',
        maint: 'Maintenance', emergency: 'Emergency callout',
        assessment: 'Assessment', upgrade: 'Upgrade', consult: 'Consultation',
      },
      methods: {
        siteinspect: 'Site inspection', scope: 'Measurement & scoping',
        supply: 'Supply & install', repair: 'Repair & replace',
        testing: 'Testing & commissioning', preventative: 'Preventative maintenance',
        snags: 'Snag list completion', walkthrough: 'Client walkthrough',
      },
    },
  },

  /**
   * Colour schemes: primary = headers/bars, accent = actions/chips.
   * The same values drive CSS variables and PDF colours.
   */
  colorSchemes: {
    slate:      { label: 'Slate & Blue',      primary: '#233154', primaryDeep: '#1a2540', accent: '#2563eb', accentInk: '#1d4ed8', accentMist: '#eff6ff', accentLine: '#bfdbfe' },
    forest:     { label: 'Forest & Green',    primary: '#1c3a2c', primaryDeep: '#142b20', accent: '#16a34a', accentInk: '#15803d', accentMist: '#f0fdf4', accentLine: '#bbf7d0' },
    terracotta: { label: 'Brick & Orange',    primary: '#5b2120', primaryDeep: '#431817', accent: '#ea580c', accentInk: '#c2410c', accentMist: '#fff7ed', accentLine: '#fed7aa' },
    ocean:      { label: 'Ocean & Sky',       primary: '#0c4a6e', primaryDeep: '#083a57', accent: '#0284c7', accentInk: '#0369a1', accentMist: '#f0f9ff', accentLine: '#bae6fd' },
    charcoal:   { label: 'Charcoal & Amber',  primary: '#26272b', primaryDeep: '#1b1c1f', accent: '#d97706', accentInk: '#b45309', accentMist: '#fffbeb', accentLine: '#fde68a' },
    plum:       { label: 'Plum & Violet',     primary: '#3b2352', primaryDeep: '#2c1a3e', accent: '#7c3aed', accentInk: '#6d28d9', accentMist: '#f5f3ff', accentLine: '#ddd6fe' },
    crimson:    { label: 'Charcoal & Red',    primary: '#2a1416', primaryDeep: '#1e0d0f', accent: '#dc2626', accentInk: '#b91c1c', accentMist: '#fef2f2', accentLine: '#fecaca' },
    teal:       { label: 'Deep Teal',         primary: '#134e4a', primaryDeep: '#0c3b38', accent: '#0d9488', accentInk: '#0f766e', accentMist: '#f0fdfa', accentLine: '#99f6e4' },
    midnight:   { label: 'Midnight & Gold',   primary: '#1e293b', primaryDeep: '#0f172a', accent: '#ca8a04', accentInk: '#a16207', accentMist: '#fefce8', accentLine: '#fef08a' },
    graphite:   { label: 'Graphite & Sky',    primary: '#334155', primaryDeep: '#1e293b', accent: '#0ea5e9', accentInk: '#0284c7', accentMist: '#f0f9ff', accentLine: '#bae6fd' },
    burgundy:   { label: 'Burgundy & Rose',   primary: '#4c1d24', primaryDeep: '#3a141a', accent: '#e11d48', accentInk: '#be123c', accentMist: '#fff1f2', accentLine: '#fecdd3' },
    bronze:     { label: 'Bronze & Cream',    primary: '#44403c', primaryDeep: '#292524', accent: '#b45309', accentInk: '#92400e', accentMist: '#fffbeb', accentLine: '#fde68a' },
    indigo:     { label: 'Indigo & Lilac',    primary: '#312e6b', primaryDeep: '#232155', accent: '#6366f1', accentInk: '#4f46e5', accentMist: '#eef2ff', accentLine: '#c7d2fe' },
    pine:       { label: 'Pine & Lime',       primary: '#1a3329', primaryDeep: '#11241d', accent: '#65a30d', accentInk: '#4d7c0f', accentMist: '#f7fee7', accentLine: '#d9f99d' },
    steel:      { label: 'Steel & Cyan',      primary: '#1f2937', primaryDeep: '#111827', accent: '#06b6d4', accentInk: '#0e7490', accentMist: '#ecfeff', accentLine: '#a5f3fc' },
    aubergine:  { label: 'Aubergine & Pink',  primary: '#3b1a3a', primaryDeep: '#2b122a', accent: '#db2777', accentInk: '#be185d', accentMist: '#fdf2f8', accentLine: '#fbcfe8' },
    navy:       { label: 'Navy & Coral',      primary: '#1e2a4a', primaryDeep: '#151d33', accent: '#f97316', accentInk: '#ea580c', accentMist: '#fff7ed', accentLine: '#fed7aa' },
    emerald:    { label: 'Emerald & Mint',    primary: '#064e3b', primaryDeep: '#043a2c', accent: '#10b981', accentInk: '#059669', accentMist: '#ecfdf5', accentLine: '#a7f3d0' },
    slateRose:  { label: 'Slate & Rose',      primary: '#3f3f46', primaryDeep: '#27272a', accent: '#f43f5e', accentInk: '#e11d48', accentMist: '#fff1f2', accentLine: '#fecdd3' },
    cobalt:     { label: 'Cobalt & Ice',      primary: '#1e3a8a', primaryDeep: '#172554', accent: '#3b82f6', accentInk: '#2563eb', accentMist: '#eff6ff', accentLine: '#bfdbfe' },
  },

  /** @returns {object} industry entry, falling back to `general` */
  industry(key) {
    return this.industries[key] || this.industries.general;
  },

  /** @returns {object} scheme entry, falling back to `slate` */
  scheme(key) {
    return this.colorSchemes[key] || this.colorSchemes.slate;
  },
};

window.IndustryPresets = IndustryPresets;