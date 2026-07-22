import { useState, useMemo, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import NewsFeed from "@/components/news/NewsFeed";
import { useCustomers } from "@/context/CustomersContext";

export default function News() {
  const { activeCustomers } = useCustomers();

  const clientsForNewsFeed = activeCustomers.map(customer => ({
    id: customer.id,
    name: customer.name
  }));

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="Create and manage company announcements for all clients." />
        <link rel="canonical" href={window.location.origin + "/news"} />
      </Helmet>

      <GradientBackdrop />

      <StandardNavigation currentPage="news" />

      <main className="container py-4 px-4 lg:py-8 lg:px-6">
        <h1 className="sr-only">Company Announcements Management</h1>
        <section>
          <NewsFeed clients={clientsForNewsFeed} showForm showExpired heading="Company Announcements" />
        </section>
      </main>
    </div>
  );
}
