import OutCall "mo:caffeineai-http-outcalls/outcall";
import Text "mo:core/Text";
import List "mo:core/List";

actor {
  public query func transform(input : OutCall.TransformationInput) : async OutCall.TransformationOutput {
    OutCall.transform(input);
  };

  func formatBearerToken(token : Text) : Text {
    if (token.startsWith(#text "Bearer ") or token.startsWith(#text "bearer ")) {
      return token;
    };
    "Bearer " # token;
  };

  func buildHeaders(token : Text) : [OutCall.Header] {
    let headers = List.empty<OutCall.Header>();
    headers.add({
      name = "accept";
      value = "application/json";
    });
    headers.add({
      name = "Authorization";
      value = formatBearerToken(token);
    });
    headers.toArray();
  };

  public func getOptionGreeks(instrumentKeys : Text, apiKey : Text) : async Text {
    let url = "https://api.upstox.com/v3/market-quote/option-greek?instrument_key=" # instrumentKeys;
    let headers = buildHeaders(apiKey);
    await OutCall.httpGetRequest(url, headers, transform);
  };

  public func getMarketDepth(instrumentKey : Text, apiKey : Text) : async Text {
    let encoded = instrumentKey;
    let url = "https://api.upstox.com/v2/market-quote/quotes?instrument_key=" # encoded # "&mode=full";
    let headers = buildHeaders(apiKey);
    await OutCall.httpGetRequest(url, headers, transform);
  };
};
