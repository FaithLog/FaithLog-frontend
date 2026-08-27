#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(FaithLogKakaoShare, NSObject)

RCT_EXTERN_METHOD(share:(NSString *)title
                  description:(NSString *)description
                  buttonTitle:(NSString *)buttonTitle
                  url:(NSString *)url
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
