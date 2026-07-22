import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Package {
  id: string;
  name: string;
  services: string[]; // VA, VR, DT, AI
  features: string[];
  // VR - Per Call Based Pricing
  price: number; // monthly price
  minutes: number; // included minutes
  overage: number; // price per extra minute
  // VA - Hours-based pricing
  packagedHours: number;
  hourlyOverageRate: number;
  // AI - Per AI-Based Pricing
  aiSetupFee: number;
  aiMonthlyFee: number;
  aiCallsAllocated: number;
  // DT - Digital Minute-Based Pricing
  digitalPricePerMinute: number;
}

interface PackagesContextType {
  packages: Package[];
  addPackage: (packageData: Omit<Package, 'id'>) => void;
  updatePackage: (id: string, packageData: Partial<Package>) => void;
  deletePackage: (id: string) => void;
}

const PackagesContext = createContext<PackagesContextType | undefined>(undefined);

const vrPackageDefs: Array<{ name: string; calls: number; base: number; rate: number; standard: number }> = [
  { name: "Starter 25", calls: 25, base: 30.00, rate: 2.00, standard: 80.00 },
  { name: "Business 40", calls: 40, base: 42.00, rate: 1.95, standard: 120.00 },
  { name: "Professional 60", calls: 60, base: 36.00, rate: 1.90, standard: 150.00 },
  { name: "Advanced 80", calls: 80, base: 36.00, rate: 1.85, standard: 184.00 },
  { name: "Enterprise 100", calls: 100, base: 30.00, rate: 1.80, standard: 210.00 },
  { name: "Scale 120", calls: 120, base: 32.50, rate: 1.75, standard: 242.50 },
  { name: "Corporate 175", calls: 175, base: 32.50, rate: 1.70, standard: 330.00 },
  { name: "Premium 200", calls: 200, base: 30.00, rate: 1.65, standard: 360.00 },
  { name: "Pro Plus 250", calls: 250, base: 30.00, rate: 1.60, standard: 430.00 },
  { name: "Elite 325", calls: 325, base: 31.25, rate: 1.55, standard: 535.00 },
  { name: "Ultimate 400", calls: 400, base: 30.00, rate: 1.55, standard: 650.00 },
  { name: "Platinuim 500", calls: 500, base: 30.00, rate: 1.50, standard: 780.00 },
  { name: "Diamond 600", calls: 600, base: 30.00, rate: 1.50, standard: 930.00 },
  { name: "Infinite 800", calls: 800, base: 30.00, rate: 1.50, standard: 1230.00 },
];

const vrSeedPackages: Package[] = vrPackageDefs.map((p, i) => ({
  id: `pkg-vr-${i + 1}`,
  name: p.name,
  services: ["VR"],
  price: p.standard,
  minutes: p.calls,
  overage: p.rate,
  features: [
    `${p.calls} included calls`,
    `Base package: £${p.base.toFixed(2)}`,
    `Additional calls at £${p.rate.toFixed(2)} per call`,
    `Price Including VAT: £${(p.standard * 1.2).toFixed(2)}`,
  ],
  packagedHours: 0,
  hourlyOverageRate: 0,
  aiSetupFee: 0,
  aiMonthlyFee: 0,
  aiCallsAllocated: 0,
  digitalPricePerMinute: 0,
}));

const clPackageDefs: Array<{ name: string; calls: number; base: number; rate: number; diary: number }> = [
  { name: "Starter 25", calls: 25, base: 30.25, rate: 2.75, diary: 99.00 },
  { name: "Business 40", calls: 40, base: 42.00, rate: 2.70, diary: 150.00 },
  { name: "Professional 60", calls: 60, base: 36.00, rate: 2.65, diary: 195.00 },
  { name: "Advanced 80", calls: 80, base: 36.00, rate: 2.60, diary: 244.00 },
  { name: "Enterprise 100", calls: 100, base: 30.00, rate: 2.55, diary: 285.00 },
  { name: "Scale 120", calls: 120, base: 30.00, rate: 2.50, diary: 330.00 },
  { name: "Corporate 175", calls: 175, base: 31.25, rate: 2.45, diary: 460.00 },
  { name: "Premium 200", calls: 200, base: 30.00, rate: 2.40, diary: 510.00 },
  { name: "Pro Plus 250", calls: 250, base: 30.00, rate: 2.35, diary: 617.50 },
  { name: "Elite 325", calls: 325, base: 31.50, rate: 2.30, diary: 779.00 },
  { name: "Ultimate 400", calls: 400, base: 30.00, rate: 2.25, diary: 930.00 },
  { name: "Platinuim 500", calls: 500, base: 30.00, rate: 2.20, diary: 1130.00 },
  { name: "Diamond 600", calls: 600, base: 30.00, rate: 2.20, diary: 1350.00 },
  { name: "Infinite 800", calls: 800, base: 30.00, rate: 2.20, diary: 1790.00 },
];

const clSeedPackages: Package[] = clPackageDefs.map((p, i) => ({
  id: `pkg-cl-${i + 1}`,
  name: `${p.name} (Clinic)`,
  services: ["CL"],
  price: p.diary,
  minutes: p.calls,
  overage: p.rate,
  features: [
    `${p.calls} included calls`,
    `Base package: £${p.base.toFixed(2)}`,
    `Additional calls at £${p.rate.toFixed(2)} per call`,
    `Price Including VAT: £${(p.diary * 1.2).toFixed(2)}`,
  ],
  packagedHours: 0,
  hourlyOverageRate: 0,
  aiSetupFee: 0,
  aiMonthlyFee: 0,
  aiCallsAllocated: 0,
  digitalPricePerMinute: 0,
}));

const cbSeedPackages: Package[] = clPackageDefs.map((p, i) => ({
  id: `pkg-cb-${i + 1}`,
  name: `${p.name} (Bookings)`,
  services: ["CB"],
  price: p.diary,
  minutes: p.calls,
  overage: p.rate,
  features: [
    `${p.calls} included calls`,
    `Base package: £${p.base.toFixed(2)}`,
    `Additional calls at £${p.rate.toFixed(2)} per call`,
    `Price Including VAT: £${(p.diary * 1.2).toFixed(2)}`,
  ],
  packagedHours: 0,
  hourlyOverageRate: 0,
  aiSetupFee: 0,
  aiMonthlyFee: 0,
  aiCallsAllocated: 0,
  digitalPricePerMinute: 0,
}));

const vaPackageDefs: Array<{ name: string; hours: number; hourly: number; base: number }> = [
  { name: "Launch Pad 5", hours: 5, hourly: 30.00, base: 150.00 },
  { name: "Boost 10", hours: 10, hourly: 30.00, base: 300.00 },
  { name: "Expand 15", hours: 15, hourly: 29.00, base: 435.00 },
  { name: "Elevate 20", hours: 20, hourly: 29.00, base: 580.00 },
  { name: "Maximise 25", hours: 25, hourly: 28.00, base: 700.00 },
  { name: "Pioneer 30", hours: 30, hourly: 28.00, base: 840.00 },
  { name: "Summit 35", hours: 35, hourly: 27.00, base: 945.00 },
  { name: "Horizon 40", hours: 40, hourly: 27.00, base: 1080.00 },
  { name: "Odyssey 45", hours: 45, hourly: 26.00, base: 1170.00 },
  { name: "Galaxy 50", hours: 50, hourly: 26.00, base: 1300.00 },
  { name: "Infinity 55", hours: 55, hourly: 25.00, base: 1375.00 },
  { name: "Beyound 60", hours: 60, hourly: 25.00, base: 1500.00 },
];

const vaSeedPackages: Package[] = vaPackageDefs.map((p, i) => ({
  id: `pkg-va-${i + 1}`,
  name: p.name,
  services: ["VA"],
  price: p.base,
  minutes: 0,
  overage: 0,
  features: [
    `${p.hours} included hours`,
    `Hourly rate: £${p.hourly.toFixed(2)}`,
    `Base package: £${p.base.toFixed(2)}`,
    `Price Including VAT: £${(p.base * 1.2).toFixed(2)}`,
  ],
  packagedHours: p.hours,
  hourlyOverageRate: p.hourly,
  aiSetupFee: 0,
  aiMonthlyFee: 0,
  aiCallsAllocated: 0,
  digitalPricePerMinute: 0,
}));

const seedPackages: Package[] = [...vrSeedPackages, ...clSeedPackages, ...cbSeedPackages, ...vaSeedPackages];

const STORAGE_KEY = 'packages_v6_vrclcbva2026';

export function PackagesProvider({ children }: { children: React.ReactNode }) {
  const [packages, setPackages] = useState<Package[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const existing: Package[] = JSON.parse(stored);
      let merged = existing;
      if (!merged.some(p => p.services.includes("CL"))) merged = [...merged, ...clSeedPackages];
      if (!merged.some(p => p.services.includes("CB"))) merged = [...merged, ...cbSeedPackages];
      if (!merged.some(p => p.services.length === 1 && p.services[0] === "VA")) merged = [...merged, ...vaSeedPackages];
      return merged;
    }
    localStorage.removeItem('packages');
    localStorage.removeItem('packages_v2_vr2026');
    localStorage.removeItem('packages_v3_vrcl2026');
    localStorage.removeItem('packages_v4_vrclva2026');
    localStorage.removeItem('packages_v5_vrclva2026');
    return seedPackages;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(packages));
  }, [packages]);

  const addPackage = (packageData: Omit<Package, 'id'>) => {
    const newPackage: Package = {
      ...packageData,
      id: `pkg-${Date.now()}`,
    };
    setPackages(prev => [...prev, newPackage]);
  };

  const updatePackage = (id: string, packageData: Partial<Package>) => {
    setPackages(prev => prev.map(pkg => 
      pkg.id === id ? { ...pkg, ...packageData } : pkg
    ));
  };

  const deletePackage = (id: string) => {
    setPackages(prev => prev.filter(pkg => pkg.id !== id));
  };

  return (
    <PackagesContext.Provider value={{
      packages,
      addPackage,
      updatePackage,
      deletePackage,
    }}>
      {children}
    </PackagesContext.Provider>
  );
}

export const usePackages = () => {
  const context = useContext(PackagesContext);
  if (context === undefined) {
    throw new Error('usePackages must be used within a PackagesProvider');
  }
  return context;
};