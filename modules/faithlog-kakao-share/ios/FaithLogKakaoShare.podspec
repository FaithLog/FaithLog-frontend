Pod::Spec.new do |s|
  s.name = 'FaithLogKakaoShare'
  s.version = '1.0.0'
  s.summary = 'FaithLog Kakao Share Expo module'
  s.description = 'Official Kakao Share SDK bridge for FaithLog.'
  s.license = { :type => 'MIT' }
  s.author = 'FaithLog'
  s.homepage = 'https://app.faithlog.kr'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
end
