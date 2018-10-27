
#include "uwsgi.h"
#include "../includes.h"



static int serve(fus_t *fus, struct wsgi_request *request){

    /* Parse vars */
    if(uwsgi_parse_vars(request))return -1;

    /* Get body */
    ssize_t body_len = 0;
    char *body = uwsgi_request_body_read(request, -1, &body_len);
    if(body == NULL)return -1;

    /* Debug: print the body */
    fprintf(stderr, "GOT BODY: %.*s\n", (int)body_len, body);

    /* Example: get a var */
    uint16_t remote_addr_len = 0;
    char *remote_addr = uwsgi_get_var(request,
        "REMOTE_ADDR", 11, &remote_addr_len);

    /* Write status & headers */
    if(uwsgi_response_prepare_headers(request, "200 OK", 6))return -1;
    if(uwsgi_response_add_content_type(request, "text/plain", 10))return -1;
    if(uwsgi_response_add_header(request, "X-Fus", 5, "Yes", 3))return -1;

    if(uwsgi_response_write_body_do(request, "Test!", 5))return -1;

    return UWSGI_OK;
}

int fus_plugin(struct wsgi_request *request){
    fus_t fus;
    fus_init(&fus);

    int status = serve(&fus, request);

    fus_cleanup(&fus);
    return UWSGI_OK;
}

