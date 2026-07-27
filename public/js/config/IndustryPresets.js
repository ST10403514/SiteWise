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
