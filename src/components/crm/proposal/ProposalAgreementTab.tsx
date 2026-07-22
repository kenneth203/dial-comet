import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { type Package } from "@/context/PackagesContext";
import { format } from "date-fns";
import { formatGBP } from "@/lib/currency";

interface AgreementFormData {
  clientAddress: string;
  phoneNumber: string;
  initials: string;
  detailsConfirmed: boolean;
  firstName: string;
  lastName: string;
  agreedToTerms: boolean;
}

interface ProposalAgreementTabProps {
  selectedPackage: Package;
  clientName: string;
  companyName: string;
  serviceLabel?: string;
  onBack: () => void;
  onSign: (data: AgreementFormData) => void;
}

export function ProposalAgreementTab({ selectedPackage, clientName, companyName, serviceLabel = "VA", onBack, onSign }: ProposalAgreementTabProps) {
  const [formData, setFormData] = useState<AgreementFormData>({
    clientAddress: "",
    phoneNumber: "",
    initials: "",
    detailsConfirmed: false,
    firstName: "",
    lastName: "",
    agreedToTerms: false,
  });

  const today = format(new Date(), "dd/MM/yyyy");
  const displayCompany = companyName || clientName || "Client";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.detailsConfirmed) {
      toast({ title: "Confirmation Required", description: "Please confirm the above details are correct.", variant: "destructive" });
      return;
    }
    if (!formData.agreedToTerms) {
      toast({ title: "Agreement Required", description: "Please agree to the terms and conditions.", variant: "destructive" });
      return;
    }
    if (!formData.firstName || !formData.lastName) {
      toast({ title: "Name Required", description: "Please enter your first and last name.", variant: "destructive" });
      return;
    }
    onSign(formData);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <img
          src="/va-team-logo.png"
          alt="The VA Team"
          className="h-14 mx-auto mb-2"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>

      {/* Contract Info */}
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>Date: {today}</p>
        <p>Client: {clientName}</p>
        {companyName && <p className="pl-12">{companyName}</p>}
        <p>Chosen Service: <span className="font-medium text-foreground">{selectedPackage.name} ({serviceLabel})</span></p>
        <p>Total: <span className="font-medium text-foreground">{formatGBP(selectedPackage.price)}</span> per month</p>
      </div>

      <Separator />

      {/* Prepayment table */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Prepayment Required:</p>
        <div className="border rounded-md overflow-hidden">
          <div className="grid grid-cols-2 bg-muted/50 p-2 text-sm font-medium">
            <span>Due Date</span>
            <span>Amount Due</span>
          </div>
          <div className="grid grid-cols-2 p-2 text-sm text-muted-foreground">
            <span>(TBD) - 1 day(s) after contract signed</span>
            <span>{formatGBP(selectedPackage.price)}</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Agreement intro */}
      <div className="space-y-4">
        <p className="text-sm font-medium text-foreground leading-relaxed">
          By signing this Agreement, {displayCompany} ("Client") has retained The VA Team Limited,
          ("Service Provider") to proceed with the requested services within the agreed proposal,
          and agrees to the terms and conditions as set forth within this agreement.
        </p>

        {/* Client details */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="clientAddress">Client's Address *</Label>
              <Textarea
                id="clientAddress"
                placeholder="Please make sure it the FULL address"
                value={formData.clientAddress}
                onChange={(e) => setFormData(f => ({ ...f, clientAddress: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agreePhone">Phone Number *</Label>
              <Input
                id="agreePhone"
                placeholder="With Area Code as well"
                value={formData.phoneNumber}
                onChange={(e) => setFormData(f => ({ ...f, phoneNumber: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Initials confirmation */}
          <div className="flex items-center gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="initials">Initials</Label>
              <Input
                id="initials"
                className="w-32"
                value={formData.initials}
                onChange={(e) => setFormData(f => ({ ...f, initials: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Checkbox
                id="detailsConfirmed"
                checked={formData.detailsConfirmed}
                onCheckedChange={(checked) => setFormData(f => ({ ...f, detailsConfirmed: checked === true }))}
              />
              <Label htmlFor="detailsConfirmed" className="cursor-pointer text-sm">
                I can confirm the above details are correct.
              </Label>
            </div>
          </div>

          <Separator />

          <p className="text-sm font-medium">Contract Services: <span className="text-primary">{selectedPackage.name} ({serviceLabel})</span></p>

          <Separator />

          {/* Client signature section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Client</h3>
            <div className="flex items-center gap-2">
              <Checkbox
                id="agreeTerms"
                checked={formData.agreedToTerms}
                onCheckedChange={(checked) => setFormData(f => ({ ...f, agreedToTerms: checked === true }))}
              />
              <Label htmlFor="agreeTerms" className="cursor-pointer text-sm">
                I agree to the terms and conditions of this contract.
              </Label>
            </div>
            <p className="text-sm text-muted-foreground">{today}</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="signFirstName">First Name *</Label>
                <Input
                  id="signFirstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData(f => ({ ...f, firstName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signLastName">Last Name *</Label>
                <Input
                  id="signLastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData(f => ({ ...f, lastName: e.target.value }))}
                  required
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Service Provider section */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Service Provider</h3>
            <p className="text-sm text-muted-foreground">
              Important notice: We do not require a signed agreement. Your use of any services or resource
              provided by us, including this website, denote your complete agreement with and acceptance of
              these terms and conditions.
            </p>
          </div>

          <Separator />

          {/* Terms & Conditions — collapsible summary */}
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer font-semibold text-foreground mb-2">
              Terms &amp; Conditions of the Service (click to expand)
            </summary>
            <div className="space-y-4 pl-2 border-l-2 border-muted mt-2">
              <p className="italic">Important notice: We do not require a signed agreement. Your use of any services or resources provided by us, including this website, denotes your complete agreement with and acceptance of these terms and conditions.</p>

              <div>
                <p className="font-semibold text-foreground">INTRODUCTION TO THESE TERMS OF SERVICES</p>
                <p className="mt-1">The VA Team Limited is a service that helps businesses delegate administration, typing, call answering, and other services. By registering for The VA Team Limited service, you confirm that the services you will request from The VA Team Limited will be integral to your business and that you are acting for purposes of your trade, business or profession.</p>
                <p className="mt-2">Please read these terms and conditions (the "Terms") and The VA Team Limited's Privacy Policy carefully before you agree to receive services from The VA Team Limited. You are referred to as the "Client" in these Terms.</p>
                <p className="mt-2">These Terms are applicable from the date on which the agreement is made between the parties, as set out in the completed proposal. We will start work when you accept our Proposal and Contract Agreement. You can accept these terms by signature, or by asking us to start work in writing.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground">1. SERVICES</p>
                <ul className="list-disc pl-5 space-y-1 mt-1">
                  <li>The services to be provided are set out in the proposal. They can be amended by mutual agreement by email or by issuing a revised proposal.</li>
                  <li>The fee is set out in the proposal. Unless otherwise specified, office out-of-pocket expenses (including stationery, telephone charges for phone-based work, postage, USBs, DVDs, CDs, paper, and consumables) will be charged as an additional charge.</li>
                  <li>Quality Standards that are unique to the project are set out in the proposal.</li>
                  <li>Unless otherwise specified in the proposal, the work is entirely undertaken at our premises. When asked to travel to other premises, travel time and travel expenses will also be separately chargeable.</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-foreground">2. BASIS OF AGREEMENT</p>
                <ul className="list-disc pl-5 space-y-1 mt-1">
                  <li>Our Services are provided on a 'business-to-business' basis. If you are using us for something personal (that is, as a consumer rather than related to your business), please let us know by email without delay. Any special cancellation rights you may have as a consumer will not override your obligation to pay for work that we have done in accordance with a proposal.</li>
                  <li>Authority: The person named in the proposal will be our main contact and has the authority to agree to payments and direct what work to do.</li>
                  <li>The Primary provider of Services will be identified in the proposal.</li>
                  <li>Associates: To provide continuity of cover or the appropriate skills mix for your support, we may suggest using associates. We contract with our associates to provide appropriate levels of security and confidentiality in line with our service to you. You will have the right to accept or reject associates before they are used. Where our associates need access to your system, we will ask you to provide individual access codes so you can track and secure their use.</li>
                  <li>Time-based proposals only: If you want us to share time records with you, this must be specified in the proposal so that we can make sure we keep them and send them as required. Time-based proposals are charged in 3-minute slots, so a two-minute call may incur a 3-minute charge if this is a unique call during the day.</li>
                  <li>Insurance: The level of liability insurance we carry is set out in the proposal. If you wish us to take out additional insurance, we are happy to do so if you agree to pay the additional cost. Normally, this is an annual cost, and it may not be possible to refund the charge if you do not use us for the exact year that our insurance runs. Upon request, we will show you our current certificates of cover and policy terms so you can take a copy.</li>
                  <li>We will not order any goods or services on your behalf unless that is authorised by the person identified as having the authority to do so.</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-foreground">3. TIMING AND STANDARD OF PROVISION OF SERVICES</p>
                <ul className="list-disc pl-5 space-y-1 mt-1">
                  <li>We will use our reasonable endeavours to deliver the Services in accordance with the timetable set out in the proposal. We will notify you in advance if we expect that deadlines may not be met.</li>
                  <li>Proofreading and sign off: While we do everything we can to ensure the accuracy of the work we do for you, the final sign-off rests with you, and it is your responsibility to check the work before it goes out.</li>
                  <li>Timetables: Our ability to meet timetables depends on your giving us timely access to all the information or resources we need from you.</li>
                  <li>Availability: Our normal working hours are Monday through Friday, 08h00am to 19h00pm, and Saturday, 09h00 – 17h00, and/or set out in the proposal. Availability outside these hours cannot be guaranteed without prior agreement, and work outside those hours will be subject to additional work surcharges. Unless otherwise specified in the proposal, this additional work surcharge will be 150% of the hourly rate for time-based proposals, or the equivalent for fixed-fee work. We are not available on Bank and Public Holidays unless expressly agreed. Our office(s) close between Christmas (25th Dec) and the New Year (2nd Jan) period each year.</li>
                  <li>We have some software and equipment that we use at no additional charge to you. But where we need license fees, or usage fees in order to provide support for you, we will charge you the cost of any licenses you have authorised us to purchase. We will normally provide all software and equipment needed to perform the Services. We will set out in the proposal (or proposal amendments) what they are and whether they are chargeable to you.</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-foreground">4. PAYMENTS, DEDUCTIONS AND HOLIDAYS</p>
                <ul className="list-disc pl-5 space-y-1 mt-1">
                  <li>Fees are chargeable in accordance with the proposal. Additional expenses are charged as described in the proposal.</li>
                  <li>Normal working hours and availability are set out in the proposal. For work outside these hours, an additional rate may be applied as set out in the proposal or under clause 3 – Availability above.</li>
                  <li>For urgent work given at less than 24 hours' notice, an urgent work rate may be charged at the rate set out in the new request for this urgent work.</li>
                  <li>Out-of-hours and urgent work rates may both be charged for the same work if it is both urgent and out of normal hours.</li>
                  <li>For proposals for a fixed fee retainer or project, additional work outside the scope of the original proposal will be charged at our normal hourly rate unless stated otherwise in the proposal.</li>
                  <li>Unless otherwise specified in the Proposal, no time remaining of retainer or project hours can be carried forward to the following month. Those hours must be used within the 4-week period from the date of purchase.</li>
                  <li>Deposits are due for payment before work commences. Non-payment of the deposit may delay the start of the work, even if you have accepted the terms and asked us to start. Payments mean when cleared funds appear in our bank account. (if applicable)</li>
                  <li>Payment is due as set out in the proposal, or, if not specified there, within 7 calendar days of the invoice date. If you do not pay by the due date, we may reschedule further work until payment is made. Additional charges may be levied for PayPal or credit card payments – see proposal.</li>
                  <li>We reserve the right to charge interest on overdue amounts at the rate set out in the proposal, or where the proposal does not specify, at the rate of 2.22% per month (equivalent to the unauthorised overdraft rate from the bank). Subsequent payments will be applied first to interest and finance charges, then to outstanding fees/costs.</li>
                  <li>Upon payment of our fees and charges, we will assign to you any agreed intellectual property rights as set out in the proposal.</li>
                  <li>This is a business-to-business arrangement where no worker's rights to statutory holiday apply between you and us. Our workers' holiday is our responsibility.</li>
                  <li>We shall keep records of our workers' leave for inspection by HMRC or any other enforcing body.</li>
                  <li>We shall deduct and pay over to HMRC any tax and national insurance that may be required under any tax obligation imposed on us. If you are involved in a dispute with HMRC over who should pay such tax, we will provide the relevant receipts and paperwork to help you reduce or resist the demand.</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-foreground">5. OWNERSHIP OF WORK / COPYRIGHT ASSIGNMENT</p>
                <ul className="list-disc pl-5 space-y-1 mt-1">
                  <li>The Rights in work done under this Agreement will be ours. Upon payment of our fees and charges, we will assign to you the Rights in any work created under the proposal. We agree to sign any further documents needed to complete the transfer of Rights to you.</li>
                  <li>Information and documents which we provide to you always remain our absolute property unless and until assigned to you.</li>
                  <li>You promise not to breach any third-party copyright rights in sending us material to work on. You promise not to use any confidential or restricted information belonging to someone else when sending us work.</li>
                  <li>We will keep full records of the work we have done for you and the contacts we have made on your behalf. We will send you copies of these records regularly or log them into our systems.</li>
                  <li>We will not access, use, copy, distribute, publish or adapt any part of any information, data or documents that you have paid for, for our own or any other person's benefit or purposes.</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-foreground">6. POLICIES AND PROCEDURES</p>
                <ul className="list-disc pl-5 space-y-1 mt-1">
                  <li>Resolving problems: If anything about your project is not going as you want, or if you have any questions or complaints, speak to us straight away.</li>
                  <li>Health and Safety: When working at our own premises, we are responsible for our own health and safety.</li>
                  <li>Working at your premises: We may, from time to time, work at your premises and be covered by your Health and Safety policy.</li>
                  <li>We will work to the standard of your social media Rules and Data Protection Policy, or to ours – whichever is the highest standard. Any specific requirements must be specified in the proposal.</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-foreground">7. INFORMATION AND DATA (with GDPR compliance)</p>
                <ul className="list-disc pl-5 space-y-1 mt-1">
                  <li><strong>7.1 Confidentiality and Purpose Limitation</strong> — We shall only process personal data provided by you to the extent necessary to perform the services outlined in the Proposal. All data received will be used strictly and solely to carry out the services requested by you.</li>
                  <li><strong>7.2 No Unauthorised Use or Downloading</strong> — We confirm that we will not download, store, copy, transmit, or use client or customer data for any purpose other than the delivery of the agreed services. We will not use such data for any commercial, analytical, or marketing purpose, nor share it with third parties unless required by law or agreed in writing.</li>
                  <li><strong>7.3 Secure Processing and Transmission</strong> — All data will be accessed and processed in secure environments. Where remote access is required, we will follow appropriate encryption and password protection protocols. Temporary backups may be made only to ensure continuity of service and will be deleted once no longer required.</li>
                  <li><strong>7.4 Sub-processors and Associates</strong> — Equivalent confidentiality and protection obligations shall contractually bind any associate or team member accessing your data. Access will be provided only where essential and shall, where applicable, be traceable using individual login credentials.</li>
                  <li><strong>7.5 Your Responsibilities</strong> — You must ensure that any data you provide to us has been collected and shared lawfully, and that appropriate consent or legal basis exists. You are responsible for advising us in writing of any specific data handling requirements, security protocols, or retention policies.</li>
                  <li><strong>7.6 Data Subject Rights and Compliance</strong> — We will assist, where possible and upon request, with fulfilling your obligations to respond to data subject requests (including access, correction, or deletion requests) as required by applicable data protection law.</li>
                  <li><strong>7.7 Data Retention</strong> — We will retain personal data only for as long as is necessary to fulfil the services and in accordance with our contractual obligations. Upon completion or termination of services, data will be securely deleted unless otherwise agreed.</li>
                  <li><strong>7.8 International Transfers</strong> — Where applicable, we will ensure that any processing or transfer of data outside the UK or EEA is carried out in compliance with the relevant safeguards under the UK GDPR (e.g., Standard Contractual Clauses or adequacy decisions).</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-foreground">8. RESTRICTION AND LIMITATION</p>
                <ul className="list-disc pl-5 space-y-1 mt-1">
                  <li>Whilst working with us, you may work alongside our associates and employees who support us. They are all subject to contractual terms that prohibit them from working directly for our clients for a period after they work for you. If you genuinely want one of our team members to work directly for you, we will consider releasing them from their contractual obligations for a suitable fee that covers the all-in cost of locating, recruiting, and training a substitute, as well as our loss of profit during this period.</li>
                  <li>Force majeure: We will not be liable for failure to provide services where it is not reasonably practicable to do so due to circumstances beyond our control.</li>
                  <li>Limitation of liability: Our fee rates are determined based on the limits of liability set out in these Terms. Before contracting for work to be done, you may request that we agree to a higher limit of liability (provided insurance cover can be obtained therefor), in which case our fee rates may be adjusted, or an additional charge may be made.</li>
                  <li>There shall be no personal liability of any of our principals, directors, partners, employees, agents or sub-contractors arising in any way out of the performance or non-performance of services or relating to the supply of products.</li>
                  <li>We shall have no liability for any indirect or consequential losses or expenses suffered by you, however caused, including but not limited to loss of anticipated profits, goodwill, reputation, business receipts or contracts, or losses or expenses or if the incorrect information has been provided to us to complete a task.</li>
                  <li>Our aggregate financial liability to you shall in no circumstances exceed the fees paid for the services that give rise to such liability.</li>
                  <li>Nothing in these Terms shall be interpreted as excluding or restricting any legal liability on us or others where liability cannot legally be excluded or restricted.</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-foreground">9. TERMINATION</p>
                <ul className="list-disc pl-5 space-y-1 mt-1">
                  <li>Either party may terminate an Agreement by giving 30 days' written notice. Notice shall be given by email to the address used on the most recent proposal unless a new email address has been notified by either party.</li>
                  <li>Termination of this agreement shall not affect rights and obligations already accrued prior to termination.</li>
                  <li>If either party is involved in illegal or unethical practice, the contract will be terminated without notice.</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-foreground">10. DEFINITIONS AND LAW</p>
                <p className="mt-1">In these Terms, the following words or phrases have the meaning set out in this clause.</p>
                <ul className="list-disc pl-5 space-y-1 mt-1">
                  <li><strong>"Proposal"</strong> — an agreement that we will supply Services on specified occasions and/or with a specified outcome as set out in a proposal or in a formal proposal.</li>
                  <li><strong>"Clause"</strong> — a stated clause of this Agreement.</li>
                  <li><strong>"Confidential Information"</strong> — includes all information: that we discover because of or through our connection with you; and which is about or relating to you or your business (including financial information, products, services, service levels, customer satisfaction, proposed services and products, pricing, and margins) or your people (including your directors or partners, investors, staff, suppliers, customers, clients, prospects and contractors). However, "Confidential Information" does not include information that is openly published by you, or information that is publicly available without breach of our confidentiality obligation.</li>
                  <li><strong>"Including"</strong> — the word "including" shall not imply any limitation on the generality of the concept or thing of which examples are being given.</li>
                  <li><strong>"Project Agreement"</strong> — the agreement comprised in a proposal and these Terms.</li>
                  <li><strong>"Rights"</strong> — includes intellectual property rights including (but not limited to) copyrights, patents, registered designs, design rights, trademarks, service marks, and the right to apply for or register any such protection, and all rights relating to trade secrets and other unpublished information.</li>
                  <li><strong>"Services"</strong> — the work to be supplied or the outcomes to be achieved by us, as set out in a proposal.</li>
                  <li><strong>"You"</strong> — refers to the person, firm or organisation for whom Services will be performed by us.</li>
                  <li><strong>"We" and "us"</strong> — refers to the person, firm or organisation agreeing to provide Services.</li>
                </ul>
                <p className="mt-2">No waiver: If we or you delay or fail to enforce any term of a proposal or these Terms on any occasion, that will not affect or limit our or your ability to enforce that term on any other occasion or at any time.</p>
                <p className="mt-1">Severability: If any provision of a proposal or these Terms is unenforceable, it shall be struck from the Project Agreement to the minimum extent necessary to make the Project Agreement enforceable and this shall not affect the enforceability of the other provisions of the Project Agreement.</p>
                <p className="mt-1">Law and jurisdiction: All Project Agreements are governed by English law and subject to the exclusive jurisdiction of the English courts.</p>
              </div>
            </div>
          </details>

          <p className="text-xs text-muted-foreground">
            The terms and conditions of this agreement may be modified or amended as necessary only by written
            instrument signed by both parties. By signing the Agreement, I indicate that I understand, agree to
            and accept the terms and conditions as contained herein, dated {today}.
          </p>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Packages
            </Button>
            <Button type="submit" className="flex-1">
              Agree & Sign Contract →
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
