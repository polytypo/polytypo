# Runs the corpus through the Ruby tools.
require "json"
require "polytypo"
require "rubypants"

cases = JSON.parse(File.read(ARGV[0]))
tools = {
  "polytypo" => [->(_c) { true }, lambda { |c, s|
    opts = { locale: c["locale"], mode: c["format"] }
    opts[:dialect] = "commonmark" if c["format"] == "markdown"
    Polytypo.transform(s, **opts)
  }],
  "rubypants" => [->(c) { c["format"] != "markdown" && c["locale"] == "en-US" }, ->(_c, s) { RubyPants.new(s).to_html }]
}
out = { "results" => {} }
tools.each do |name, (applies, run)|
  out["results"][name] = { "html" => false, "cases" => {} }
  cases.each do |c|
    next unless applies.call(c)
    begin
      once = run.call(c, c["input"])
      out["results"][name]["cases"][c["id"]] = { "once" => once, "twice" => run.call(c, once) }
    rescue StandardError => e
      out["results"][name]["cases"][c["id"]] = { "error" => e.message[0, 120] }
    end
  end
end
File.write(ARGV[1], JSON.generate(out))
