import { render, screen } from "@testing-library/react";
import {
  Badge,
  Breadcrumbs,
  Button,
  ButtonLink,
  DataTable,
  Pagination,
  PriceChange,
  Sparkline,
  sparklinePoints,
} from ".";

describe("Button", () => {
  it("is a button by default and can be a link", () => {
    render(
      <>
        <Button>Save</Button>
        <ButtonLink href="/fa">Home</ButtonLink>
      </>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/fa");
  });
});

describe("PriceChange", () => {
  it.each([
    [0.0123, "+1.23%", "text-up"],
    [-0.05, "-5.00%", "text-down"],
    [0, "0.00%", "text-muted"],
  ])("%s shows %s in %s", (ratio, text, tone) => {
    render(<PriceChange locale="en" ratio={ratio} />);
    expect(screen.getByText(text)).toHaveClass(tone);
  });

  it("uses Persian digits in fa", () => {
    render(<PriceChange locale="fa" ratio={0.5} />);
    expect(screen.getByText(/۵۰٫۰۰/)).toBeInTheDocument();
  });
});

describe("Sparkline", () => {
  it("fits the values into the box", () => {
    expect(sparklinePoints([1, 2, 3], 100, 10)).toBe("0.00,10.00 50.00,5.00 100.00,0.00");
    expect(sparklinePoints([5, 5], 10, 10)).toBe("0.00,10.00 10.00,10.00");
    expect(sparklinePoints([1], 10, 10)).toBe("");
  });

  it("is labeled and colored by trend", () => {
    render(<Sparkline values={[3, 2, 1]} label="Bitcoin, 7 days" />);
    expect(screen.getByRole("img", { name: "Bitcoin, 7 days" })).toHaveClass("text-down");
  });
});

describe("Breadcrumbs", () => {
  it("links every item but the current page", () => {
    render(
      <Breadcrumbs
        label="Breadcrumbs"
        items={[
          { label: "Home", href: "/en" },
          { label: "Coins", href: "/en/coins" },
          { label: "Bitcoin", href: "/x" },
        ]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Breadcrumbs" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("Bitcoin")).toHaveAttribute("aria-current", "page");
  });
});

describe("DataTable", () => {
  const columns = [
    { key: "name", header: "Name", cell: (r: { name: string; price: string }) => r.name },
    {
      key: "price",
      header: "Price",
      numeric: true,
      cell: (r: { name: string; price: string }) => r.price,
    },
  ];

  it("renders a captioned table with end-aligned numbers", () => {
    render(
      <DataTable
        caption="Coins"
        columns={columns}
        rows={[{ name: "Bitcoin", price: "1" }]}
        rowKey={(r) => r.name}
      />,
    );
    expect(screen.getByRole("table", { name: "Coins" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Price" })).toHaveClass("text-end");
    expect(screen.getByRole("cell", { name: "1" })).toHaveClass("tabular");
  });

  it("shows the empty state without rows", () => {
    render(
      <DataTable
        caption="Coins"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.name}
        empty={<p>None</p>}
      />,
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("None")).toBeInTheDocument();
  });
});

describe("Pagination", () => {
  it("renders only the links it has", () => {
    render(<Pagination label="Pages" next={{ href: "/en?cursor=abc", label: "Next" }} />);
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute("rel", "next");
    expect(screen.queryByRole("link", { name: /Previous/ })).toBeNull();
  });

  it("renders nothing without links", () => {
    const { container } = render(<Pagination label="Pages" />);
    expect(container).toBeEmptyDOMElement();
  });
});

it("Badge renders its tone", () => {
  render(<Badge tone="warning">unverified</Badge>);
  expect(screen.getByText("unverified")).toHaveClass("text-warning");
});
