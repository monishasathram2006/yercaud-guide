import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EnquiryForm } from "@/components/EnquiryForm";
import { ApiError } from "@/lib/api";

/**
 * Component tests for the "Have a Question?" enquiry form used on every
 * details page (Hotel/Restaurant/Activity/Tour). Covers the QA test-case
 * sheet's client-testable rows (TC001-TC060) that this component owns:
 * rendering, client-side validation, submit/loading/success/error states.
 */

const submitEnquiry = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      listings: {
        submitEnquiry: (...args: unknown[]) => submitEnquiry(...args),
      },
    },
  };
});

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null }),
}));

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EnquiryForm listingId="listing-1" listingName="Test Hotel" />
    </QueryClientProvider>,
  );
}

function getFields() {
  return {
    name: screen.getByPlaceholderText("Enter your name"),
    email: screen.getByPlaceholderText("Enter your email"),
    phone: screen.getByPlaceholderText("Enter your phone number"),
    message: screen.getByPlaceholderText("Type your message here..."),
  };
}

beforeEach(() => {
  submitEnquiry.mockReset();
  submitEnquiry.mockResolvedValue({ id: "enq-1" });
});

describe("EnquiryForm — rendering (TC001-TC004)", () => {
  it("TC001 form loads with all fields and the submit button", () => {
    renderForm();
    const { name, email, phone, message } = getFields();
    expect(name).toBeInTheDocument();
    expect(email).toBeInTheDocument();
    expect(phone).toBeInTheDocument();
    expect(message).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Enquiry" })).toBeInTheDocument();
  });

  it("TC002 Name, Email, Phone, Message fields are all present", () => {
    renderForm();
    expect(screen.getByText("Your Name")).toBeInTheDocument();
    expect(screen.getByText("Email Address")).toBeInTheDocument();
    expect(screen.getByText("Phone Number")).toBeInTheDocument();
    expect(screen.getByText("Your Message")).toBeInTheDocument();
  });

  it("TC003 placeholder text is correct per field", () => {
    renderForm();
    expect(screen.getByPlaceholderText("Enter your name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your phone number")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type your message here...")).toBeInTheDocument();
  });

  it("TC004 field labels render as text next to each field", () => {
    renderForm();
    ["Your Name", "Email Address", "Phone Number", "Your Message"].forEach((label) =>
      expect(screen.getByText(label)).toBeInTheDocument(),
    );
  });
});

describe("EnquiryForm — validation (TC005-TC028)", () => {
  it("TC005 empty submit shows validation for required fields, no API call", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    expect(await screen.findByText("Enter your name")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Add a short message")).toBeInTheDocument();
    expect(submitEnquiry).not.toHaveBeenCalled();
  });

  it("TC006 valid name is accepted (no name error)", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
    expect(screen.queryByText("Enter your name")).not.toBeInTheDocument();
  });

  it("TC007 name with numbers ('John123') — no numeric restriction is implemented", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John123");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
    expect(screen.queryByText("Enter your name")).not.toBeInTheDocument();
  });

  it("TC008 name with special characters ('@John!') — no character restriction is implemented", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "@John!");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
    expect(screen.queryByText("Enter your name")).not.toBeInTheDocument();
  });

  it("TC009 single-character name ('J') is rejected — minimum length is 2", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "J");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    expect(await screen.findByText("Enter your name")).toBeInTheDocument();
    expect(submitEnquiry).not.toHaveBeenCalled();
  });

  it("TC010 a 300-character name has no max-length enforced (input, and submit succeeds)", async () => {
    const user = userEvent.setup();
    renderForm();
    const longName = "a".repeat(300);
    const nameInput = getFields().name as HTMLInputElement;
    await user.click(nameInput);
    await user.paste(longName);
    expect(nameInput.value.length).toBe(300);
    expect(nameInput.maxLength === -1 || nameInput.maxLength >= 300).toBe(true);
  });

  it("TC011 leading/trailing spaces in name are trimmed before the API call", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "  John  ");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
    expect(submitEnquiry.mock.calls[0][1].name).toBe("John");
  });

  it("TC012 a valid email is accepted", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
    expect(screen.queryByText("Enter a valid email")).not.toBeInTheDocument();
  });

  it("TC013 email without @ is rejected — blocked by the input's native type=\"email\" constraint before the form's own onSubmit ever runs (no noValidate on the form)", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "johntest.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    expect((getFields().email as HTMLInputElement).validity.valid).toBe(false);
    expect(submitEnquiry).not.toHaveBeenCalled();
    expect(screen.queryByText("Enter a valid email")).not.toBeInTheDocument();
  });

  it("TC014 email without domain ('john@') is rejected — blocked by native constraint validation, same as TC013", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    expect((getFields().email as HTMLInputElement).validity.valid).toBe(false);
    expect(submitEnquiry).not.toHaveBeenCalled();
  });

  it("TC015 email with multiple @ is rejected — blocked by native constraint validation, same as TC013", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@@gmail.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    expect((getFields().email as HTMLInputElement).validity.valid).toBe(false);
    expect(submitEnquiry).not.toHaveBeenCalled();
  });

  it("TC016 uppercase email is accepted", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "JOHN@TEST.COM");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
    expect(screen.queryByText("Enter a valid email")).not.toBeInTheDocument();
  });

  it("TC017 email with an internal space is rejected — blocked by native constraint validation, same as TC013", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john @gmail.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    expect((getFields().email as HTMLInputElement).validity.valid).toBe(false);
    expect(submitEnquiry).not.toHaveBeenCalled();
  });

  it("TC018 a valid 10-digit phone is accepted", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().phone, "9876543210");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
    expect(screen.queryByText("Enter a valid phone")).not.toBeInTheDocument();
  });

  it("TC019 phone below the 7-character minimum is rejected", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().phone, "98765");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    expect(await screen.findByText("Enter a valid phone")).toBeInTheDocument();
    expect(submitEnquiry).not.toHaveBeenCalled();
  });

  it("TC020 a 13-digit phone has no max-length validation — it is accepted", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().phone, "9876543210123");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
    expect(screen.queryByText("Enter a valid phone")).not.toBeInTheDocument();
  });

  it("TC021 phone containing letters is rejected", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().phone, "98AB765432");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    expect(await screen.findByText("Enter a valid phone")).toBeInTheDocument();
    expect(submitEnquiry).not.toHaveBeenCalled();
  });

  it("TC022 phone with a leading '-' is accepted — '-', '+' and spaces are allowed characters", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().phone, "-9876543119");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
    expect(screen.queryByText("Enter a valid phone")).not.toBeInTheDocument();
  });

  it("TC023 phone with an internal space is accepted — spaces are an allowed character", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().phone, "98765 43210");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
    expect(screen.queryByText("Enter a valid phone")).not.toBeInTheDocument();
  });

  it("TC024 a normal message is accepted", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
    expect(screen.queryByText("Add a short message")).not.toBeInTheDocument();
  });

  it("TC025 empty message is rejected", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    expect(await screen.findByText("Add a short message")).toBeInTheDocument();
    expect(submitEnquiry).not.toHaveBeenCalled();
  });

  it("TC026 a 5000-character message has no max-length enforced — submit succeeds", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    const big = "a".repeat(5000);
    const messageBox = getFields().message as HTMLTextAreaElement;
    await user.click(messageBox);
    await user.paste(big);
    expect(messageBox.value.length).toBe(5000);
    expect(messageBox.maxLength === -1).toBe(true);
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
  });

  it("TC027 a message containing an HTML/script tag is sent to the API as plain text, unsanitised client-side", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    const payload = "<script>alert(1)</script>";
    await user.click(getFields().message);
    await user.paste(payload);
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
    expect(submitEnquiry.mock.calls[0][1].message).toBe(payload);
  });

  it("TC028 a SQL-injection-shaped message is sent as an ordinary string (no client-side escaping/stripping)", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    const payload = "' OR 1=1--";
    await user.click(getFields().message);
    await user.paste(payload);
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
    expect(submitEnquiry.mock.calls[0][1].message).toBe(payload);
  });
});

describe("EnquiryForm — submission behaviour (TC029-TC038, TC046, TC055, TC057)", () => {
  it("TC029 pasted values populate fields correctly", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(getFields().name);
    await user.paste("Jane Roe");
    expect(getFields().name).toHaveValue("Jane Roe");
  });

  it("TC030 submit with all valid data calls the API with the trimmed payload", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().phone, "9876543210");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalledWith("listing-1", {
      name: "John Doe",
      email: "john@test.com",
      phone: "9876543210",
      message: "Need quotation",
    }));
  });

  it("TC031 the button shows a loading label and is disabled while the mutation is pending", async () => {
    let resolveFn: (v: unknown) => void;
    submitEnquiry.mockImplementation(() => new Promise((resolve) => { resolveFn = resolve; }));
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    const pendingButton = await screen.findByRole("button", { name: "Sending…" });
    expect(pendingButton).toBeDisabled();
    resolveFn!({ id: "enq-1" });
  });

  it("TC032 the submit button is disabled immediately after the first click, so a rapid second click sends only one request", async () => {
    let resolveFn: (v: unknown) => void;
    submitEnquiry.mockImplementation(() => new Promise((resolve) => { resolveFn = resolve; }));
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().message, "Need quotation");
    const button = screen.getByRole("button", { name: "Send Enquiry" });
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await user.click(button); // second click on the now-disabled button
    expect(submitEnquiry).toHaveBeenCalledTimes(1);
    resolveFn!({ id: "enq-1" });
  });

  it("TC033 a success confirmation is shown after submitting", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    expect(await screen.findByText("Enquiry sent!")).toBeInTheDocument();
    expect(screen.getByText(/Test Hotel will get back to you shortly/)).toBeInTheDocument();
  });

  it("TC034 a server error shows a user-friendly inline error message, not a crash", async () => {
    submitEnquiry.mockRejectedValue(new ApiError(500, "Internal server error"));
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    expect(await screen.findByText("Internal server error")).toBeInTheDocument();
    expect(screen.queryByText("Enquiry sent!")).not.toBeInTheDocument();
  });

  it("TC035 a network failure (rejected fetch, not an ApiError) leaks the raw browser error instead of a friendly message", async () => {
    // send.error instanceof Error is true for a TypeError too, so the
    // "Could not send your enquiry" fallback never triggers for a real
    // network failure — only for a non-Error rejection, which fetch never
    // produces. The user sees the raw "Failed to fetch" string verbatim.
    submitEnquiry.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    expect(await screen.findByText("Failed to fetch")).toBeInTheDocument();
    expect(screen.queryByText("Could not send your enquiry. Please try again.")).not.toBeInTheDocument();
  });

  it("TC046 field values are retained after a validation error", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().message, "Need quotation");
    // email left blank -> validation error
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(getFields().name).toHaveValue("John Doe");
    expect(getFields().message).toHaveValue("Need quotation");
  });

  it("TC055 the form is replaced by a success view after submission (fields no longer present to refill)", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await screen.findByText("Enquiry sent!");
    expect(screen.queryByPlaceholderText("Enter your name")).not.toBeInTheDocument();
  });

  it("TC057 correcting an invalid field and resubmitting clears its validation message", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    // Syntactically valid per the browser's native type="email" constraint
    // (so the native check doesn't intercept the submit, see TC013), but
    // missing a dot in the domain, so the app's own regex still rejects it.
    await user.type(getFields().email, "john@localhost");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();

    await user.type(getFields().email, ".com");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(screen.queryByText("Enter a valid email")).not.toBeInTheDocument());
  });
});

describe("EnquiryForm — content and misc (TC047-TC049, TC056, TC060)", () => {
  it("TC047 an emoji in the message is accepted and sent as-is", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.type(getFields().message, "Great place 😊");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
    expect(submitEnquiry.mock.calls[0][1].message).toBe("Great place 😊");
  });

  it("TC048 international/unicode characters in the name are accepted", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "José Müller");
    await user.type(getFields().email, "jose@test.com");
    await user.type(getFields().message, "Need quotation");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await waitFor(() => expect(submitEnquiry).toHaveBeenCalled());
    expect(submitEnquiry.mock.calls[0][1].name).toBe("José Müller");
  });

  it("TC049 a script payload in the message never executes (React renders text, not markup)", async () => {
    submitEnquiry.mockResolvedValue({ id: "enq-1" });
    const user = userEvent.setup();
    renderForm();
    await user.type(getFields().name, "John Doe");
    await user.type(getFields().email, "john@test.com");
    await user.click(getFields().message);
    await user.paste("<img src=x onerror=alert(1)>");
    await user.click(screen.getByRole("button", { name: "Send Enquiry" }));
    await screen.findByText("Enquiry sent!");
    expect(document.querySelector("img[onerror]")).not.toBeInTheDocument();
  });

  it("TC056 no required-field indicator (e.g. asterisk) is rendered on mandatory labels", () => {
    renderForm();
    expect(screen.getByText("Your Name").textContent).not.toMatch(/\*/);
    expect(screen.getByText("Email Address").textContent).not.toMatch(/\*/);
    expect(screen.getByText("Your Message").textContent).not.toMatch(/\*/);
  });

  it("TC060 the 'typically replies' footer text is displayed correctly", () => {
    renderForm();
    expect(screen.getByText("Typically replies within a few hours")).toBeInTheDocument();
  });
});
