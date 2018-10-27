
#include "uwsgi.h"
#include "../includes.h"



int fus_plugin(struct wsgi_request *request){

    if(uwsgi_parse_vars(request))return -1;

    uint16_t remote_addr_len = 0;
    char *remote_addr = uwsgi_get_var(request,
        "REMOTE_ADDR", 11, &remote_addr_len);

    if(uwsgi_response_prepare_headers(request, "200 OK", 6))return -1;
    if(uwsgi_response_add_content_type(request, "text/plain", 10))return -1;
    if(uwsgi_response_add_header(request, "X-Fus", 5, "Yes", 3))return -1;

    if(uwsgi_response_write_body_do(request, "Test!", 5))return -1;

    return UWSGI_OK;
}

