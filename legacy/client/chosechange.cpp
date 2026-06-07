#include "chosechange.h"
#include "ui_chosechange.h"
#include "wideuse.h"

chosechange::chosechange(QWidget *parent) :
    QDialog(parent),
    ui(new Ui::chosechange)
{
    ui->setupUi(this);
    connect(this,SIGNAL(getUsrPoke(QList<QString>&)),udpthread,SLOT(initUser(QList<QString>&)));
    connect(udpthread,SIGNAL(userGet(QList<QString>&)),this,SLOT(myTable(QList<QString>&)));
    getMy();

}

chosechange::~chosechange()
{
    disconnect(this,SIGNAL(getUsrPoke(QList<QString>&)),udpthread,SLOT(initUser(QList<QString>&)));
    disconnect(udpthread,SIGNAL(userGet(QList<QString>&)),this,SLOT(myTable(QList<QString>&)));
    delete myPokeModel;
    delete ui;
}

void chosechange::getMy()
{
    QList<QString> text;
    text << "7" << localUser->getName();
    emit getUsrPoke(text);
}

void chosechange::getMyPoke(const QItemSelection&,const QItemSelection&)
{
    which = ui->myPoke->currentIndex().row();
    myChosen = 1;
}

void chosechange::myTable(QList<QString> &poke)
{
    qint32 i = 0;
    rowNum = poke.count("line");
    myPokeModel = new QStandardItemModel(this);
    myPokeModel->setColumnCount(3);
    myPokeModel->setRowCount(rowNum);
    myPokeModel->setHeaderData(0,Qt::Horizontal,"精灵名");
    myPokeModel->setHeaderData(1,Qt::Horizontal,"等级");
    myPokeModel->setHeaderData(2,Qt::Horizontal,"经验");
    for(qint32 row = 0; row < rowNum; row++)
    {
        for(qint32 col = 0; col < 3; col++)
        {
            if(poke.at(i) == "line")
                i++;
            QStandardItem *item = new QStandardItem(poke.at(i));
            myPokeModel->setItem(row,col,item);
            i++;
        }
    }
    ui->myPoke->setModel(myPokeModel);
    ui->myPoke->setEditTriggers(QAbstractItemView::NoEditTriggers);
    ui->myPoke->verticalHeader()->setVisible(false);
    ui->myPoke->resizeColumnsToContents();
    ui->myPoke->setSelectionMode(QAbstractItemView::SingleSelection);
    ui->myPoke->setSelectionBehavior(QAbstractItemView::SelectRows);
    connect(ui->myPoke->selectionModel(),SIGNAL(selectionChanged(const QItemSelection&,const QItemSelection&)),
            this,SLOT(getMyPoke(const QItemSelection&,const QItemSelection&)));
}

void chosechange::on_sureBtn_clicked()
{
    if(!myChosen)
            QMessageBox::warning(this, tr("警告！"),tr("请选择您的精灵"),QMessageBox::Yes);
    else
    {
        localUser->choseToBattle(which);
        accept();
    }
}

void chosechange::closeEvent(QCloseEvent *event)
{
    event->ignore();
}
