import React, { createContext, useContext, useEffect, useState } from "react";

export type ChargeFrequency = "monthly" | "one-off";

export interface AdditionalCharge {
  id: string;
  name: string;
  description: string;
  amount: number; // GBP
  frequency: ChargeFrequency;
  // Optional secondary amount (e.g. activation fee for cover)
  secondaryLabel?: string;
  secondaryAmount?: number;
}

interface AdditionalChargesContextType {
  charges: AdditionalCharge[];
  addCharge: (c: Omit<AdditionalCharge, "id">) => void;
  updateCharge: (id: string, c: Partial<AdditionalCharge>) => void;
  deleteCharge: (id: string) => void;
}

const AdditionalChargesContext = createContext<AdditionalChargesContextType | undefined>(undefined);

const seedCharges: AdditionalCharge[] = [
  {
    id: "ac-additional-lines",
    name: "Additional Lines for Existing Customer",
    description: "An extra phone line added to an existing customer account.",
    amount: 20.0,
    frequency: "monthly",
  },
  {
    id: "ac-additional-calls",
    name: "Additional Calls Over Package",
    description:
      "Calls taken above the included package allowance, billed at the standard per-call rate of the customer's package.",
    amount: 0,
    frequency: "monthly",
  },
  {
    id: "ac-weekend-services",
    name: "Weekend Services",
    description: "Saturday & Sunday call coverage between 9 AM – 1 PM.",
    amount: 99.0,
    frequency: "monthly",
  },
  {
    id: "ac-holiday-cover",
    name: "Holiday & Short Term Cover",
    description:
      "Temporary cover for customers on holiday or requiring short-term answering. Charged in addition to the call package selected.",
    amount: 25.0,
    frequency: "one-off",
    secondaryLabel: "Activation Fee",
    secondaryAmount: 25.0,
  },
];

const STORAGE_KEY = "additional_charges_v1";

export function AdditionalChargesProvider({ children }: { children: React.ReactNode }) {
  const [charges, setCharges] = useState<AdditionalCharge[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
    return seedCharges;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(charges));
  }, [charges]);

  const addCharge = (c: Omit<AdditionalCharge, "id">) =>
    setCharges((prev) => [...prev, { ...c, id: `ac-${Date.now()}` }]);

  const updateCharge = (id: string, c: Partial<AdditionalCharge>) =>
    setCharges((prev) => prev.map((x) => (x.id === id ? { ...x, ...c } : x)));

  const deleteCharge = (id: string) => setCharges((prev) => prev.filter((x) => x.id !== id));

  return (
    <AdditionalChargesContext.Provider value={{ charges, addCharge, updateCharge, deleteCharge }}>
      {children}
    </AdditionalChargesContext.Provider>
  );
}

export function useAdditionalCharges() {
  const ctx = useContext(AdditionalChargesContext);
  if (!ctx) throw new Error("useAdditionalCharges must be used within AdditionalChargesProvider");
  return ctx;
}
