"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
with the License. A copy of the License is located at

    http://www.apache.org/licenses/LICENSE-2.0

or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
and limitations under the License.
"""
import enums
from weighted.weighted import WeightedArray


class Page:
    MAIN = "main"
    CATEGORY = "category"
    SEARCH = "search"
    DETAIL = "detail"
    CART = "cart"
    CHECKOUT = "checkout"
    RESULT = "result"
    PROFILE = "profile"
    LOGIN = "login"
    SIGN_UP = "signup"
    EXIT = "exit"
    # can't manually reach page
    SPLASH = "splash"
    LIVE = "live"


def get_next_page(page_name):
    next_page = ''
    if page_name == Page.MAIN:
        next_page = next_page_of_main.get_random_item()
    if page_name == Page.CATEGORY:
        next_page = next_page_of_category.get_random_item()
    if page_name == Page.CART:
        next_page = next_page_of_cart.get_random_item()
    if page_name == Page.SEARCH:
        next_page = next_page_of_search.get_random_item()
    if page_name == Page.DETAIL:
        next_page = next_page_of_detail.get_random_item()
    if page_name == Page.CHECKOUT:
        next_page = next_page_of_checkout.get_random_item()
    if page_name == Page.RESULT:
        next_page = next_page_of_result.get_random_item()
    if page_name == Page.PROFILE:
        next_page = next_page_of_profile.get_random_item()
    if page_name == Page.LOGIN:
        next_page = next_page_of_login.get_random_item()
    if page_name == Page.SIGN_UP:
        next_page = next_page_of_signup.get_random_item()
    if page_name == Page.LIVE:
        next_page = next_page_of_live.get_random_item()
    return next_page


next_page_of_login = WeightedArray(
    [(Page.MAIN, 93), (Page.SIGN_UP, 6), (Page.EXIT, 1)])
next_page_of_signup = WeightedArray(
    [(Page.MAIN, 70), (Page.LOGIN, 20), (Page.EXIT, 10)])
next_page_of_main = WeightedArray(
    [(Page.SEARCH, 12), (Page.CATEGORY, 18), (Page.LIVE, 25), (Page.DETAIL, 43), (Page.CART, 12), (Page.PROFILE, 6),
     (Page.EXIT, 1)])
next_page_of_category = WeightedArray(
    [(Page.SEARCH, 12), (Page.DETAIL, 45), (Page.MAIN, 20), (Page.PROFILE, 5), (Page.CART, 16), (Page.EXIT, 1)])
next_page_of_search = WeightedArray(
    [(Page.CATEGORY, 12), (Page.MAIN, 15), (Page.DETAIL, 30), (Page.EXIT, 1)])
next_page_of_detail = WeightedArray(
    [(Page.SEARCH, 5), (Page.DETAIL, 15), (Page.CATEGORY, 17), (Page.MAIN, 20), (Page.CART, 10), (Page.CHECKOUT, 3),
     (Page.EXIT, 1)])
next_page_of_detail_without_scroll = WeightedArray(
    [(Page.SEARCH, 5), (Page.CATEGORY, 17), (Page.MAIN, 20), (Page.CART, 10), (Page.CHECKOUT, 3),
     (Page.EXIT, 1)])
next_page_of_cart = WeightedArray(
    [(Page.MAIN, 25), (Page.CATEGORY, 21), (Page.DETAIL, 10), (Page.CHECKOUT, 5), (Page.PROFILE, 16), (Page.EXIT, 1)])
next_page_of_empty_cart = WeightedArray(
    [(Page.MAIN, 25), (Page.CATEGORY, 21), (Page.PROFILE, 16), (Page.EXIT, 1)])
next_page_of_checkout = WeightedArray(
    [(Page.CART, 25), (Page.RESULT, 20), (Page.EXIT, 1)])
next_page_of_result = WeightedArray(
    [(Page.MAIN, 40), (Page.PROFILE, 40), (Page.EXIT, 1)])
next_page_of_profile = WeightedArray(
    [(Page.MAIN, 20), (Page.CATEGORY, 20), (Page.CART, 15), (Page.LOGIN, 5), (Page.EXIT, 1)])
next_page_of_live = WeightedArray(
    [(Page.MAIN, 20), (Page.DETAIL, 80), (Page.EXIT, 1)])


def get_page_by_platform(page, platform):
    if platform == enums.Platform.Android:
        return AndroidScreen.get_screen(page)
    elif platform == enums.Platform.iOS:
        return iOSScreen.get_screen(page)
    elif platform == enums.Platform.Web:
        return WebScreen.get_screen(page)


class AndroidScreen:
    SPLASH = ('SplashActivity', "com.example.shopping.SplashActivity")
    LOGIN = ('LoginActivity', "com.example.shopping.LoginActivity")
    SIGN_UP = ('SignupActivity', "com.example.shopping.SignupActivity")
    MAIN = ("MainActivity", "com.example.shopping.MainActivity")
    CATEGORY = ("CategoryActivity", "com.example.shopping.CategoryActivity")
    SEARCH = ("SearchActivity", "com.example.shopping.SearchActivity")
    PRODUCT_DETAIL = ("ProductDetailActivity", "com.example.shopping.ProductDetailActivity")
    SHOPPING_CART = ("ShoppingCartActivity", "com.example.shopping.ShoppingCartActivity")
    CHECKOUT = ("CheckoutActivity", "com.example.shopping.CheckoutActivity")
    BUY_RESULT = ("BuyResultActivity", "com.example.shopping.BuyResultActivity")
    PROFILE = ("ProfileActivity", "com.example.shopping.ProfileActivity")
    LIVE = ("LiveActivity", "com.example.shopping.LiveActivity")
    EXIT = ("", "")

    @staticmethod
    def get_screen(screen_name):
        if screen_name == Page.SPLASH:
            return AndroidScreen.SPLASH
        elif screen_name == Page.LOGIN:
            return AndroidScreen.LOGIN
        elif screen_name == Page.SIGN_UP:
            return AndroidScreen.SIGN_UP
        elif screen_name == Page.MAIN:
            return AndroidScreen.MAIN
        elif screen_name == Page.CATEGORY:
            return AndroidScreen.CATEGORY
        elif screen_name == Page.SEARCH:
            return AndroidScreen.SEARCH
        elif screen_name == Page.DETAIL:
            return AndroidScreen.PRODUCT_DETAIL
        elif screen_name == Page.CART:
            return AndroidScreen.SHOPPING_CART
        elif screen_name == Page.CHECKOUT:
            return AndroidScreen.CHECKOUT
        elif screen_name == Page.RESULT:
            return AndroidScreen.BUY_RESULT
        elif screen_name == Page.PROFILE:
            return AndroidScreen.PROFILE
        elif screen_name == Page.LIVE:
            return AndroidScreen.LIVE
        else:
            return AndroidScreen.EXIT


class iOSScreen:
    SPLASH = ('SplashVC', "com.example.shopping.SplashVC")
    LOGIN = ('LoginVC', "com.example.shopping.LoginVC")
    SIGN_UP = ('SignupVC', "com.example.shopping.SignupVC")
    MAIN = ("MainVC", "com.example.shopping.MainVC")
    CATEGORY = ("CategoryVC", "com.example.shopping.CategoryVC")
    SEARCH = ("SearchVC", "com.example.shopping.SearchVC")
    PRODUCT_DETAIL = ("ProductDetailVC", "com.example.shopping.ProductDetailVC")
    SHOPPING_CART = ("ShoppingCartVC", "com.example.shopping.ShoppingCartVC")
    CHECKOUT = ("CheckoutVC", "com.example.shopping.CheckoutVC")
    BUY_RESULT = ("BuyResultVC", "com.example.shopping.BuyResultVC")
    PROFILE = ("ProfileVC", "com.example.shopping.ProfileVC")
    LIVE = ("LiveVC", "com.example.shopping.LiveVC")
    EXIT = ("", "")

    @staticmethod
    def get_screen(screen_name):
        if screen_name == Page.SPLASH:
            return iOSScreen.SPLASH
        elif screen_name == Page.LOGIN:
            return iOSScreen.LOGIN
        elif screen_name == Page.SIGN_UP:
            return iOSScreen.SIGN_UP
        elif screen_name == Page.MAIN:
            return iOSScreen.MAIN
        elif screen_name == Page.CATEGORY:
            return iOSScreen.CATEGORY
        elif screen_name == Page.SEARCH:
            return iOSScreen.SEARCH
        elif screen_name == Page.DETAIL:
            return iOSScreen.PRODUCT_DETAIL
        elif screen_name == Page.CART:
            return iOSScreen.SHOPPING_CART
        elif screen_name == Page.CHECKOUT:
            return iOSScreen.CHECKOUT
        elif screen_name == Page.RESULT:
            return iOSScreen.BUY_RESULT
        elif screen_name == Page.PROFILE:
            return iOSScreen.PROFILE
        elif screen_name == Page.LIVE:
            return iOSScreen.LIVE
        else:
            return iOSScreen.EXIT


class WebScreen:
    INDEX = ("indexPage", enums.host_name + "/index")
    LOGIN = ("loginPage", enums.host_name + "/login")
    SIGN_UP = ("signupPage", enums.host_name + "/signup")
    CATEGORY = ("categoryPage", enums.host_name + "/category")
    SEARCH = ("searchPage", enums.host_name + "/search")
    PRODUCT = ("productPage", enums.host_name + "/product")
    CART = ("cartPage", enums.host_name + "/cart")
    CHECKOUT = ("checkoutPage", enums.host_name + "/checkout")
    RESULT = ("resultPage", enums.host_name + "/result")
    PROFILE = ("profilePage", enums.host_name + "/profile")
    LIVE = ("livePage", enums.host_name + "/live")
    EXIT = ("", "")

    @staticmethod
    def get_screen(screen_name):
        if screen_name == Page.MAIN:
            return WebScreen.INDEX
        elif screen_name == Page.LOGIN:
            return WebScreen.LOGIN
        elif screen_name == Page.SIGN_UP:
            return WebScreen.SIGN_UP
        elif screen_name == Page.CATEGORY:
            return WebScreen.CATEGORY
        elif screen_name == Page.SEARCH:
            return WebScreen.SEARCH
        elif screen_name == Page.DETAIL:
            return WebScreen.PRODUCT
        elif screen_name == Page.CART:
            return WebScreen.CART
        elif screen_name == Page.CHECKOUT:
            return WebScreen.CHECKOUT
        elif screen_name == Page.RESULT:
            return WebScreen.RESULT
        elif screen_name == Page.PROFILE:
            return WebScreen.PROFILE
        elif screen_name == Page.LIVE:
            return WebScreen.LIVE
        else:
            return iOSScreen.EXIT
