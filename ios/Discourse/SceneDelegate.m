#import "SceneDelegate.h"
#import "AppDelegate.h"

#import <React/RCTLinkingManager.h>
#import <RCTRootViewFactory.h>

@implementation SceneDelegate

// Builds the window from the connecting UIWindowScene (instead of AppDelegate's
// default [UIScreen mainScreen].bounds-based creation, which RCTAppDelegate no
// longer performs -- see AppDelegate.m's automaticallyLoadReactNativeWindow = NO).
// Mirrors RCTAppDelegate's own default loadReactNativeWindow: behavior, just
// scene-bound, and also carries forward any deep link / Universal Link that
// triggered a cold launch (same data application:didFinishLaunchingWithOptions:'s
// launchOptions used to carry pre-Scene).
- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)connectionOptions
{
  if (![scene isKindOfClass:[UIWindowScene class]]) {
    return;
  }
  UIWindowScene *windowScene = (UIWindowScene *)scene;

  AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;

  self.window = [[UIWindow alloc] initWithWindowScene:windowScene];
  UIView *rootView = [appDelegate.rootViewFactory viewWithModuleName:appDelegate.moduleName
                                                   initialProperties:appDelegate.initialProps
                                                       launchOptions:nil];
  UIViewController *rootViewController = [UIViewController new];
  rootViewController.view = rootView;
  self.window.rootViewController = rootViewController;
  [self.window makeKeyAndVisible];

  for (UIOpenURLContext *context in connectionOptions.URLContexts) {
    [RCTLinkingManager application:UIApplication.sharedApplication
                            openURL:context.URL
                            options:context.options];
  }
  if (connectionOptions.userActivities.anyObject) {
    [RCTLinkingManager application:UIApplication.sharedApplication
               continueUserActivity:connectionOptions.userActivities.anyObject
                 restorationHandler:^(NSArray *_Nullable __unused restorableObjects) {
                 }];
  }
}

// Hot path: app already running, custom URL scheme (nitians://, iitians://, ...).
- (void)scene:(UIScene *)scene openURLContexts:(NSSet<UIOpenURLContext *> *)URLContexts
{
  for (UIOpenURLContext *context in URLContexts) {
    [RCTLinkingManager application:UIApplication.sharedApplication
                            openURL:context.URL
                            options:context.options];
  }
}

// Hot path: app already running, Universal Link / Siri shortcut.
- (void)scene:(UIScene *)scene continueUserActivity:(NSUserActivity *)userActivity
{
  [RCTLinkingManager application:UIApplication.sharedApplication
             continueUserActivity:userActivity
               restorationHandler:^(NSArray *_Nullable __unused restorableObjects) {
               }];
}

@end
