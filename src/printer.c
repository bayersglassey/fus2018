
#include "includes.h"


#define FUS_PRINTER_LOG_UNEXPECTED_VALUE(VM, VALUE) { \
    fus_vm_t *vm = (VM); \
    fus_value_t value = (VALUE); \
    fprintf(stderr, "%s: WARNING: unexpected value: ", __func__); \
    fus_value_fprint(vm, value, stderr); \
    fprintf(stderr, "\n"); \
}



void fus_printer_init(fus_printer_t *printer){
    printer->debug = 0;

    fus_printer_set_file(printer, stdout);

    printer->buffer_len = 0;
    printer->buffer_maxlen = FUS_PRINTER_BUFSIZE - 1;

    printer->shallow_values = false;
    printer->shallow_data = false;

    printer->depth = 0;
    fus_printer_set_style_full(printer);
}

void fus_printer_cleanup(fus_printer_t *printer){
    /* Do we want to add a bool field controlling whether the
    following occurs?.. */
    fus_printer_flush(printer);
}



void fus_printer_set_style_inline(fus_printer_t *printer){
    printer->tab = "";
    printer->newline = " ";
}

void fus_printer_set_style_full(fus_printer_t *printer){
    printer->tab = "  ";
    printer->newline = "\n";
}

void fus_printer_set_flush(fus_printer_t *printer,
    fus_printer_flush_t *flush, void *data
){
    printer->flush = flush;
    printer->data = data;
}

void fus_printer_set_file(fus_printer_t *printer, FILE *file){
    fus_printer_set_flush(printer, &fus_printer_flush_file, file);
}

int fus_printer_flush_file(fus_printer_t *printer){
    FILE *file = printer->data;
    printer->buffer[printer->buffer_len] = '\0';
    return fputs(printer->buffer, file);
}

int fus_printer_flush(fus_printer_t *printer){
    if(printer->debug >= 1)fprintf(stderr, "FLUSHING: [%.*s]\n",
        printer->buffer_len, printer->buffer);
    int ret = printer->flush(printer);
    printer->buffer_len = 0;
    return ret;
}



void fus_printer_write(fus_printer_t *printer, const char *text,
    int text_len
){
    if(printer->debug >= 1)fprintf(stderr,
        "WRITING: [%.*s]\n", text_len, text);

    if(printer->buffer_len + text_len > printer->buffer_maxlen){
        fus_printer_flush(printer);
    }
    if(printer->buffer_len + text_len > printer->buffer_maxlen){
        fprintf(stderr, "%s: Text is too long, will be truncated! "
            "%i + %i > %i \n",
            __func__,
            printer->buffer_len, text_len, printer->buffer_maxlen);
        fprintf(stderr, "Text was: %.*s\n", text_len, text);
        text_len = printer->buffer_maxlen - printer->buffer_len;
    }

    strncpy(printer->buffer + printer->buffer_len, text, text_len);
    printer->buffer_len += text_len;

    if(printer->debug >= 2)fprintf(stderr, "BUFFER: [%.*s]\n",
        printer->buffer_len, printer->buffer);
}

void fus_printer_write_char(fus_printer_t *printer, char c){
    fus_printer_write(printer, &c, 1);
}

void fus_printer_write_text(fus_printer_t *printer, const char *text){
    fus_printer_write(printer, text, strlen(text));
}

void fus_printer_write_long_int(fus_printer_t *printer, long int i){
    const char *s = fus_write_long_int(i);
    if(s)fus_printer_write_text(printer, s);
}

void fus_printer_write_tabs(fus_printer_t *printer){
    int depth = printer->depth;
    for(int i = 0; i < depth; i++){
        fus_printer_write_text(printer, printer->tab);
    }
}

void fus_printer_write_newline(fus_printer_t *printer){
    fus_printer_write_text(printer, printer->newline);
    fus_printer_write_tabs(printer);
}


static void fus_printer_write_str(fus_printer_t *printer, fus_str_t *s){
    fus_printer_write_text(printer, "\"");

    const char *text = s->text;
    int len = s->len;
    for(int i = 0; i < len; i++){
        char c = text[i];
        if(c == '\n'){
            fus_printer_write_text(printer, "\\n");
        }else if(c == '"'){
            fus_printer_write_text(printer, "\\\"");
        }else if(strchr(FUS_STR_ESCAPABLE_CHARS, c)){
            fus_printer_write_text(printer, "\\");
            fus_printer_write_char(printer, c);
        }else{
            fus_printer_write_char(printer, c);
        }
    }

    fus_printer_write_text(printer, "\"");
}



void fus_printer_write_value(fus_printer_t *printer,
    fus_vm_t *vm, fus_value_t value
){
    if(FUS_IS_BOXED(value)){
        fus_printer_write_boxed(printer, value.p);
        return;
    }

    if(FUS_IS_NULL(value)){
        fus_printer_write_text(printer, "null");
    }else if(FUS_IS_TRUE(value)){
        fus_printer_write_text(printer, "T");
    }else if(FUS_IS_FALSE(value)){
        fus_printer_write_text(printer, "F");
    }else if(FUS_IS_INT(value)){
        fus_unboxed_t i = FUS_GET_PAYLOAD(value.i);
        fus_printer_write_long_int(printer, i);
    }else if(FUS_IS_SYM(value)){
        int sym_i = FUS_GET_PAYLOAD(value.i);
        fus_symtable_entry_t *entry = fus_symtable_get_entry(
            vm->symtable, sym_i);
        if(entry->is_name){
            fus_printer_write_char(printer, '`');
            fus_printer_write_text(printer, entry->token);
        }else{
            fus_printer_write_text(printer, "(` ");
            fus_printer_write_text(printer, entry->token);
            fus_printer_write_text(printer, ")");
        }
    }else if(FUS_IS_ERR(value)){
        fus_printer_write_text(printer, "err");
    }else{
        FUS_PRINTER_LOG_UNEXPECTED_VALUE(vm, value)
        fus_printer_write_text(printer, "(\"Got a weird value\" error)");
    }
}

void fus_printer_write_boxed(fus_printer_t *printer, fus_boxed_t *p){
    fus_boxed_type_t type = p->type;
    if(type == FUS_BOXED_ARR){
        fus_printer_write_text(printer, "arr");
        fus_arr_t *a = &p->data.a;
        if(a->values.len > 0){
            if(printer->shallow_values){
                fus_printer_write_text(printer, " ...");
            }else{
                printer->depth++;
                fus_printer_write_newline(printer);
                fus_printer_write_arr(printer, p->vm, a);
                printer->depth--;
            }
        }
    }else if(type == FUS_BOXED_OBJ){
        fus_printer_write_text(printer, "obj");
        fus_obj_t *o = &p->data.o;
        if(o->keys.len > 0){
            if(printer->shallow_values){
                fus_printer_write_text(printer, " ...");
            }else{
                printer->depth++;
                fus_printer_write_newline(printer);
                fus_printer_write_obj(printer, p->vm, o);
                printer->depth--;
            }
        }
    }else if(type == FUS_BOXED_STR){
        fus_str_t *s = &p->data.s;
        fus_printer_write_str(printer, s);
    }else if(type == FUS_BOXED_FUN){
        fus_fun_t *f = &p->data.f;
        if(f->name){
            fus_printer_write_text(printer, "&");
            fus_printer_write_text(printer, f->name);
        }else{
            fus_printer_write_fun(printer, p->vm, f);
        }
    }else{
        fus_printer_write_text(printer, "(\"Got weird boxed value\" error)");
    }
}

void fus_printer_write_arr(fus_printer_t *printer,
    fus_vm_t *vm, fus_arr_t *a
){
    int len = a->values.len;
    fus_value_t *values = FUS_ARR_VALUES(*a);
    for(int i = 0; i < len; i++){
        if(i > 0)fus_printer_write_newline(printer);
        fus_printer_write_value(printer, vm, values[i]);
        fus_printer_write_text(printer, " ,");
    }
}

static void _fus_printer_write_obj(fus_printer_t *printer,
    fus_vm_t *vm, fus_obj_t *o, bool as_data
){
    fus_symtable_t *table = vm->symtable;
    int len = o->keys.len;
    int *keys = FUS_ARRAY_GET_REF(o->keys, 0);
    fus_value_t *values = FUS_ARR_VALUES(o->values);
    for(int i = 0; i < len; i++){
        const char *token = fus_symtable_get_token(table, keys[i]);
        fus_value_t value = values[i];

        if(i > 0)fus_printer_write_newline(printer);

        if(as_data){
            fus_printer_write_text(printer, token);
            fus_printer_write_text(printer, ": ");

            bool indent = false;
            if(indent){
                printer->depth++;
                fus_printer_write_newline(printer);
            }
            if(fus_value_is_arr(value)){
                fus_printer_write_data(printer, vm, &value.p->data.a, 0, -1);
            }else if(fus_value_is_obj(value)){
                fus_printer_write_obj_as_data(printer, vm, &value.p->data.o);
            }else{
                fus_printer_write_value(printer, vm, value);
            }
            if(indent)printer->depth--;
        }else{
            fus_printer_write_value(printer, vm, value);

            fus_printer_write_text(printer, " =.");
            fus_printer_write_text(printer, token);
        }
    }
}

void fus_printer_write_obj(fus_printer_t *printer,
    fus_vm_t *vm, fus_obj_t *o
){
    _fus_printer_write_obj(printer, vm, o, false);
}

void fus_printer_write_obj_as_data(fus_printer_t *printer,
    fus_vm_t *vm, fus_obj_t *o
){
    _fus_printer_write_obj(printer, vm, o, true);
}

void fus_printer_write_fun(fus_printer_t *printer,
    fus_vm_t *vm, fus_fun_t *f
){
    fus_arr_t *data = &f->data;
    fus_printer_write_text(printer, "fun");
    if(f->has_sig){
        fus_arr_t *sig = &f->sig;
        fus_printer_write_text(printer, " of(");
        fus_printer_set_style_inline(printer);
        fus_printer_write_data(printer, vm, sig, 0, -1);
        fus_printer_set_style_full(printer);
        fus_printer_write_text(printer, ")");
    }
    if(data->values.len > 0){
        fus_printer_write_text(printer, ":");
        if(printer->shallow_values){
            fus_printer_write_text(printer, " ...");
        }else{
            printer->depth++;
            fus_printer_write_newline(printer);
            fus_printer_write_data(printer, vm, data, 0, -1);
            printer->depth--;
        }
    }else{
        fus_printer_write_text(printer, "()");
    }
}

void fus_printer_write_data(fus_printer_t *printer,
    fus_vm_t *vm, fus_arr_t *a, int i0, int i1
){
    int len = a->values.len;
    fus_value_t *values = FUS_ARR_VALUES(*a);
    if(i1 < 0 || i1 > len)i1 = len;
    for(int i = i0; i < i1; i++){
        if(i != 0){
            fus_printer_write_newline(printer);
        }

        fus_value_t value = values[i];
        if(FUS_IS_INT(value)){
            fus_unboxed_t i = FUS_GET_PAYLOAD(value.i);
            fus_printer_write_long_int(printer, i);
        }else if(FUS_IS_SYM(value)){
            int sym_i = FUS_GET_PAYLOAD(value.i);
            fus_symtable_entry_t *entry = fus_symtable_get_entry(
                vm->symtable, sym_i);
            fus_printer_write_text(printer, entry->token);
        }else if(FUS_IS_BOXED(value)){
            fus_boxed_t *p = value.p;
            fus_boxed_type_t type = p->type;
            if(type == FUS_BOXED_ARR){
                fus_printer_write_text(printer, ":");
                if(printer->shallow_data){
                    fus_printer_write_text(printer, " ...");
                }else{
                    printer->depth++;
                    fus_printer_write_newline(printer);
                    fus_printer_write_data(printer, vm, &p->data.a, 0, -1);
                    printer->depth--;
                }
            }else if(type == FUS_BOXED_STR){
                fus_printer_write_str(printer, &p->data.s);
            }else if(type == FUS_BOXED_OBJ){
                fus_printer_write_obj_as_data(printer, vm, &p->data.o);
            }else if(type == FUS_BOXED_FUN){
                fus_printer_write_fun(printer, vm, &p->data.f);
            }else{
                fus_printer_write_text(printer, "<UNEXPECTED>");
            }
        }else{
            FUS_PRINTER_LOG_UNEXPECTED_VALUE(vm, value)
            fus_printer_write_text(printer, "<UNEXPECTED>");
        }
    }
}



#define FUS_PRINTER_PRINT_T(FNAME, T, TNAME) \
    int fus_printer_print_##FNAME(fus_printer_t *printer, fus_vm_t *vm, \
        fus_##T##_t *TNAME \
    ){ \
        fus_printer_write_##FNAME(printer, vm, TNAME); \
        return fus_printer_flush(printer); \
    }

FUS_PRINTER_PRINT_T(arr, arr, a)
FUS_PRINTER_PRINT_T(obj, obj, o)
FUS_PRINTER_PRINT_T(obj_as_data, obj, o)
FUS_PRINTER_PRINT_T(fun, fun, f)

int fus_printer_print_data(fus_printer_t *printer, fus_vm_t *vm, fus_arr_t *a, int i0, int i1){
    fus_printer_write_data(printer, vm, a, i0, i1);
    return fus_printer_flush(printer);
}

int fus_printer_print_value(fus_printer_t *printer, fus_vm_t *vm,
    fus_value_t value
){
    fus_printer_write_value(printer, vm, value);
    return fus_printer_flush(printer);
}
