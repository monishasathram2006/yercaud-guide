import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListingThumb } from "@/components/ListingThumb";

describe("ListingThumb", () => {
  it("renders the image when a src is given", () => {
    render(
      <ListingThumb
        src="https://images.example/photo.jpg"
        alt="Grand Palace Hotel"
        className="h-20 w-20"
      />,
    );

    const img = screen.getByAltText("Grand Palace Hotel") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toBe("https://images.example/photo.jpg");
  });

  it("falls back to a placeholder instead of a broken image when src is null", () => {
    render(<ListingThumb src={null} alt="Grand Palace Hotel" className="h-20 w-20" />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("No photo yet")).toBeInTheDocument();
  });
});
