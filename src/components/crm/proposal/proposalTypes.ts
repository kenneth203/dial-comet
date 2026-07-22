export interface ProposalInitialData {
  firstName: string;
  lastName: string;
  email: string;
  telephone: string;
  companyName: string;
  heardAboutUs: string;
}

export interface ProposalRecord {
  id: string;
  serviceType: "VA" | "VR" | "AI" | "DT" | "CL" | "CB";
  packageName: string;
  packagePrice: number;
  invoiceNumber: string;
  clientName: string;
  companyName: string;
  clientAddress: string;
  signedAt: string;
  agreementInitials: string;
  status: "signed";
}
